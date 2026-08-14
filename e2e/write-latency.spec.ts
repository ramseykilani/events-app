import type { Dialog } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  ACCOUNT_A,
  expectCalendar,
  openEventFromCalendar,
  signIn,
  uniqueTitle,
  visibleText,
} from './helpers';

// B-1 regression: the edit Save used to share the 2s READ budget, so a slow
// find_or_create_event was aborted client-side, showError dumped the
// AbortError stack into a window.alert, and the server could still commit.
// Writes now get their own 15s budget and failures are short alerts. These
// specs delay the network past the old budget and assert the new behavior.
//
// Route patterns are regexes so query strings / CORS preflights also match.
// route.continue() is guarded: when the client aborts mid-delay, continuing
// the request throws "request already handled".

test('write latency: a 3s find_or_create_event still saves, with no alert', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E write-latency', testInfo.project.name);
  const editedTitle = `${title} edited`;

  await signIn(page, ACCOUNT_A);

  // Create and open an event before any route is installed.
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);
  await openEventFromCalendar(page, title);

  // Fail loudly on any window.alert (showError/showAlert on web) instead of
  // letting Playwright auto-dismiss it behind a downstream timeout.
  const dialogs: string[] = [];
  const onDialog = (dialog: Dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  };
  page.on('dialog', onDialog);

  // 3s: past the old 2s read budget, well under the 15s write budget.
  await page.route(/\/rpc\/find_or_create_event/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      await route.continue();
    } catch {
      // Client already aborted this request mid-delay.
    }
  });

  try {
    await page
      .getByRole('button', { name: 'Edit' })
      .filter({ visible: true })
      .click();
    const titleInput = page.getByPlaceholder('Event title');
    await expect(titleInput).toHaveValue(title);
    await titleInput.fill(editedTitle);
    await page.getByRole('button', { name: 'Save' }).click();

    // The save survives the delay: the detail screen shows the new snapshot
    // and no error dialog fired.
    await expect(visibleText(page, editedTitle)).toBeVisible({ timeout: 15000 });
    expect(dialogs).toEqual([]);
  } finally {
    page.off('dialog', onDialog);
    await page.unroute(/\/rpc\/find_or_create_event/);
  }

  // Cleanup: remove the caller's copy. After the edit fork, Remove pops back
  // to the pre-edit detail (no longer owned) — Back lands on the calendar.
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Remove Event' })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Back' }).filter({ visible: true })
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole('button', { name: 'Back' })
    .filter({ visible: true })
    .click();
  await expectCalendar(page);
  await expect(page.getByText(editedTitle, { exact: true })).not.toBeVisible();
});

test('read latency: a delayed calendar fetch keeps events and shows the retry banner', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E read-latency', testInfo.project.name);

  await signIn(page, ACCOUNT_A);

  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);
  await expect(visibleText(page, title)).toBeVisible();

  // 3s per attempt: each of the three 2s attempts times out client-side.
  await page.route(/\/rpc\/get_calendar_events/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      await route.continue();
    } catch {
      // Client aborted this attempt; the retry issues a fresh request.
    }
  });

  try {
    // Trigger the useFocusEffect refetch by leaving to the detail and back.
    await openEventFromCalendar(page, title);
    await page
      .getByRole('button', { name: 'Back' })
      .filter({ visible: true })
      .click();
    await expectCalendar(page);

    // Last-good data stays on screen while the retries exhaust (~6s), then
    // the retry banner appears. 20s: 3 x 2s attempts + mobile overhead blows
    // the 10s expect default.
    await expect(visibleText(page, title)).toBeVisible();
    await expect(
      page.getByText('Could not load events. Tap to retry.')
    ).toBeVisible({ timeout: 20000 });
    await expect(visibleText(page, title)).toBeVisible();
  } finally {
    await page.unroute(/\/rpc\/get_calendar_events/);
  }

  // Cleanup: remove the event (refetches succeed again once unrouted).
  await openEventFromCalendar(page, title);
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Remove Event' })
    .filter({ visible: true })
    .click();
  await expectCalendar(page);
  await expect(page.getByText(title, { exact: true })).not.toBeVisible();
});
