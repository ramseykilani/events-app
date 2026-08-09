import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  uniqueTitle,
  visibleText,
} from './helpers';

// Event detail actions (M-007, with M-006's disabled-state check): Share opens
// the share sheet (which refuses to share with zero selection), Edit forks the
// event and the detail shows the new snapshot, Remove deletes only the
// caller's copy. Dates must render formatted, never raw YYYY-MM-DD.
test('event detail: share sheet, edit fork, formatted date, remove', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E detail', testInfo.project.name);
  const editedTitle = `${title} edited`;

  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();

  // Share screen: the header action is disabled until someone is picked.
  await expect(page.getByText('Share with')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Share', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Open the detail from the calendar.
  await expectCalendar(page);
  await openEventFromCalendar(page, title);
  await expect(visibleText(page, title)).toBeVisible();
  // Display dates come from lib/format.ts (e.g. "Sun, Aug 9"), never raw ISO.
  await expect(page.getByText(/\d{4}-\d{2}-\d{2}/)).not.toBeVisible();

  // Share from detail routes to the same sheet and back.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Event' })
  ).toBeVisible();

  // Edit creates a fork; the detail shows the new snapshot.
  await page.getByRole('button', { name: 'Edit' }).click();
  const titleInput = page.getByPlaceholder('Event title');
  await expect(titleInput).toHaveValue(title);
  await titleInput.fill(editedTitle);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(visibleText(page, editedTitle)).toBeVisible({
    timeout: 15000,
  });

  // Remove cleans up the caller's copy. The edit forked the event and
  // replaced the screen, so removing pops back to the PRE-EDIT detail (which
  // we no longer own — no Edit/Remove buttons); Back lands on the calendar.
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
