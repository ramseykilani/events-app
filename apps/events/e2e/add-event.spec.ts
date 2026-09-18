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
  await page.getByPlaceholder('Venue or address').fill('Signal, 175 Morgan Ave');

  await save.click();

  // Saving routes to the share screen; back out without sharing.
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // The event appears on today's day list, then removal takes it away.
  await expectCalendar(page);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await openEventFromCalendar(page, title);
  // The location renders as the tappable Maps row on the detail (Location).
  await expect(
    page
      .getByRole('button', { name: 'Open Signal, 175 Morgan Ave in Maps' })
      .filter({ visible: true })
  ).toBeVisible();
  await removeOpenEvent(page);
  await expect(page.getByText(title, { exact: true })).not.toBeVisible();
});

// Regression: the browser's segmented date widget makes year typos easy
// (typing 2026 can land as 1906) and the event would silently save a century
// off. The save path now blocks implausible years with a clear message.
test('implausible year is blocked with a clear message', async ({ page }) => {
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill('Should never save');
  await page.getByLabel('Date', { exact: true }).fill('1906-09-15');

  let dialogMessage: string | null = null;
  page.on('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Save' }).click();

  await expect
    .poll(() => dialogMessage, { message: 'year guard alert to fire' })
    .toContain('1906');
  // Still on the form — nothing was saved.
  await expect(page.getByPlaceholder('Event title')).toBeVisible();
});
