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
  visibleText,
} from './helpers';

// Who's Coming end to end: A shares an event to B; B answers yes on their
// copy; A's "Shared with" list shows the answer; B flips to no; A sees the
// flip. The asker push fires only when the answer CHANGES — the spec counts
// send-response-notification requests on B's page (push delivery itself is
// native-only; web never carries a push token).
//
// Same cleanup discipline as share.spec.ts: both accounts are shared
// fixtures, so A removes their copy and B removes theirs at the end.
test('recipient answers yes/no and the asker sees it on Shared with', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const title = uniqueTitle('E2E whos-coming', testInfo.project.name);

  // --- Account A: make sure account B is in My People (idempotent upsert).
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();

  // --- Account A: create an event for today and share it with B.
  await createEventAndShareToB(page, title);

  const contextB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const pageB = await contextB.newPage();
  // Count asker-notification invokes: one per answer CHANGE, never for a
  // re-tap of the current answer. POST only — the cross-origin invoke fires
  // a CORS preflight OPTIONS that must not count.
  let notifyCalls = 0;
  pageB.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('send-response-notification')) {
      notifyCalls += 1;
    }
  });
  try {
    // --- Account B: open the received event; the reply widget shows.
    await pageB.goto('/');
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await openEventFromCalendar(pageB, title);
    await expect(
      pageB.getByText(/are you in\?/).filter({ visible: true })
    ).toBeVisible({ timeout: 15000 });

    // --- B answers yes → one asker notification.
    await pageB.getByLabel("Yes, I'm in").filter({ visible: true }).click();
    await expect
      .poll(() => notifyCalls, { timeout: 15000 })
      .toBe(1);

    // --- Re-tapping the current answer is a no-op (no RPC, no push).
    await pageB.getByLabel("Yes, I'm in").filter({ visible: true }).click();
    await pageB.waitForTimeout(1500);
    expect(notifyCalls).toBe(1);

    // --- A opens the event: Shared with shows B's yes.
    await openEventFromCalendar(page, title);
    await expect(visibleText(page, 'Shared with')).toBeVisible();
    await expect(visibleText(page, PERSON_B_NAME)).toBeVisible();
    await expect(visibleText(page, 'Yes')).toBeVisible({ timeout: 15000 });
    // A created the event — there is nobody for A to answer.
    await expect(page.getByText(/are you in\?/)).toBeHidden();

    // --- B flips to no → a second asker notification.
    await pageB.getByLabel("No, I'm out").filter({ visible: true }).click();
    await expect
      .poll(() => notifyCalls, { timeout: 15000 })
      .toBe(2);

    // --- A reloads (pull model): the list now shows no.
    await page.reload();
    await openEventFromCalendar(page, title);
    await expect(visibleText(page, 'No')).toBeVisible({ timeout: 15000 });
    await expect(visibleText(page, 'Yes')).toBeHidden();

    // --- Cleanup: A removes their copy (the sends and answers go with it),
    // then B removes theirs.
    await removeOpenEvent(page);
    await expect(page.getByText(title, { exact: true })).not.toBeVisible();
    await openEventFromCalendar(pageB, title);
    await removeOpenEvent(pageB);
  } finally {
    await contextB.close();
  }
});
