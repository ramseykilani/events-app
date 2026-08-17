import { expect, newExtraContext, test } from './fixtures';
import {
  ACCOUNT_B,
  PERSON_B_NAME,
  addPersonManually,
  createEventAndShareToB,
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  signIn,
  uniqueTitle,
} from './helpers';

// Forwarding semantics end to end (E-104, E-108, E-109): account A shares an
// event with account B, B's calendar shows it immediately, A's later removal
// of their own copy does not touch B's copy.
//
// Both accounts are shared test fixtures, so this test cleans up after
// itself: A removes their copy as part of the assertion, B removes theirs at
// the end. A failure mid-test can leave a uniquely-titled event behind —
// harmless, but subsequent runs stay green regardless because titles are
// unique per run and the person add is an idempotent upsert.
test('sharing delivers B their own copy that survives A removing theirs', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const title = uniqueTitle('E2E share', testInfo.project.name);

  // --- Account A: make sure account B is in My People (idempotent upsert).
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();

  // --- Account A: create an event for today and share it with B.
  await createEventAndShareToB(page, title);

  // --- Account B (separate signed-out browser context): sign in, event is
  // on today.
  const contextB = await newExtraContext(browser, testInfo);
  const pageB = await contextB.newPage();
  try {
    await signIn(pageB, ACCOUNT_B);
    // Generous timeout: B's first fetch includes session bootstrap plus the
    // calendar query on a freshly created context, and this step is where a
    // slow runner shows up first.
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 30000,
    });

    // --- A removes their own copy; B's copy must survive (E-108).
    await openEventFromCalendar(page, title);
    await removeOpenEvent(page);
    await expect(page.getByText(title, { exact: true })).not.toBeVisible();

    await pageB.reload();
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 15000,
    });

    // --- Cleanup: B removes their copy too.
    await openEventFromCalendar(pageB, title);
    await removeOpenEvent(pageB);
    await expect(pageB.getByText(title, { exact: true })).not.toBeVisible();
  } finally {
    await contextB.close();
  }
});

// The no-unshare explanation must be on the share screen before the first
// send — not only after someone is already ✓ Shared.
test('share screen explains no-unshare before the first send', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E no-unshare note', testInfo.project.name);

  // The note renders once people exist (the empty list routes to add-people),
  // so make sure account B is in My People first (idempotent upsert).
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();

  // Create an event; the share screen follows automatically.
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();

  // Nobody selected, nobody shared yet — the explanation is already there.
  await expect(
    page.getByText(/Sharing is like sending a text/).filter({ visible: true })
  ).toBeVisible();

  // Back out and clean up the unshared event.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);
  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});
