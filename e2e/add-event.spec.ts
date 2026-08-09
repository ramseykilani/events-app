import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
} from './helpers';

// Covers the web add-event flow end to end (M-005, E-110) and removal
// (E-103): HTML date/time inputs must work in the browser, the new event
// lands on today's day list, and removing it deletes only the caller's copy.
test('add event via web inputs, then remove it', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E event', testInfo.project.name);

  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();

  // Save stays disabled until a title or URL is entered.
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();

  await page.getByPlaceholder('Event title').fill(title);

  // Web renders native HTML date/time inputs (the native datetimepicker
  // never opens in a browser). The date defaults to today; set it
  // explicitly so the flow proves the input is wired up.
  const dateInput = page.getByLabel('Date', { exact: true });
  await expect(dateInput).toHaveAttribute('type', 'date');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  await dateInput.fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Time (optional)').fill('18:30');

  await save.click();

  // Saving routes to the share screen; back out without sharing.
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // The event appears on today's day list, then removal takes it away.
  await expectCalendar(page);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
  await expect(page.getByText(title, { exact: true })).not.toBeVisible();
});
