import { expect, newExtraContext, test } from './fixtures';
import { AUTH_FILE_B } from './constants';
import {
  ACCOUNT_B,
  PERSON_B_NAME,
  addPersonManually,
  createEventAndShareToB,
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
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

  // --- Account B (separate context booting from B's stored session, created
  // once per run by the setup project — no per-test sign-in): event is on
  // today.
  const contextB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const pageB = await contextB.newPage();
  try {
    await pageB.goto('/');
    await expectCalendar(pageB);
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

// Share Sent Confirmation: a successful share keeps the sender on the sheet
// with a persistent "✓ Sent to N people" line — no navigation, no
// auto-dismiss — the picked rows flip to their sent state, and Cancel
// becomes Done for the exit.
test('share stays on the sheet with a persistent sent confirmation', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E sent confirmation', testInfo.project.name);

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

  // Select B — retry until the selection circle fills (taps can race
  // re-renders), then send.
  const rowB = page
    .getByRole('button', { name: PERSON_B_NAME })
    .filter({ visible: true });
  await expect(async () => {
    if (!(await rowB.getByTestId('selection-circle-selected').isVisible().catch(() => false))) {
      await rowB.click();
    }
    await expect(rowB.getByTestId('selection-circle-selected')).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  // The confirmation appears and the screen does not navigate. The flipped
  // row reads "✓ Shared" — success is one word for app users and SMS
  // contacts alike; only carrier-reported failures read differently.
  await expect(
    page.getByText('✓ Sent to 1 person').filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByText('Share with')).toBeVisible();
  await expect(
    page.getByText('✓ Shared').filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  // Done is the exit; the calendar shows the event.
  await page.getByRole('button', { name: 'Done' }).click();
  await expectCalendar(page);
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  // Cleanup.
  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});

// After B removes their copy, A can share the same event with B again
// (restore). No-unshare still holds while B has the copy (✓ Shared).
test('A can share again after B removes their copy', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const title = uniqueTitle('E2E restore share', testInfo.project.name);

  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();

  await createEventAndShareToB(page, title);

  const contextB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const pageB = await contextB.newPage();
  try {
    await pageB.goto('/');
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 30000,
    });

    await openEventFromCalendar(pageB, title);
    await removeOpenEvent(pageB);
    await expect(pageB.getByText(title, { exact: true })).not.toBeVisible();

    // A's sheet no longer locks B — they are selectable again.
    await openEventFromCalendar(page, title);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText('Share with')).toBeVisible();
    await expect(page.getByText('✓ Shared').filter({ visible: true })).toHaveCount(0);

    const rowB = page
      .getByRole('button', { name: PERSON_B_NAME })
      .filter({ visible: true });
    await expect(async () => {
      if (!(await rowB.getByTestId('selection-circle-selected').isVisible().catch(() => false))) {
        await rowB.click();
      }
      await expect(rowB.getByTestId('selection-circle-selected')).toBeVisible({
        timeout: 2000,
      });
    }).toPass();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(
      page.getByText('✓ Sent to 1 person').filter({ visible: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expectCalendar(page);

    await pageB.reload();
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 15000,
    });

    await openEventFromCalendar(pageB, title);
    await removeOpenEvent(pageB);
  } finally {
    await contextB.close();
  }

  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});
