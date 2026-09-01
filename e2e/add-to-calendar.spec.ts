import type { Download, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
} from './helpers';

// Add to Other Calendars (FEATURES.md): the event detail's export row. Web
// behavior is the CI surface — the Google button opens the template link in
// a new tab (route-fulfilled here so no external request leaves the runner)
// and the Apple/Outlook button downloads a Blob .ics. Both are snapshot
// exports: floating local time, timed → 1-hour block, no time → all-day.
// The native hand-offs (iOS EventKit sheet, Android insert intent) are
// device-only and verified by manual smoke, not here.

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('download has no stream');
  let data = '';
  for await (const chunk of stream) data += chunk;
  return data;
}

// Events are created for today (the calendar's selected day), so the
// expected Google/ICS date strings come from the local clock — the same
// local components the builders use.
function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function tomorrowYmd(): string {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return `${tomorrow.getFullYear()}${String(tomorrow.getMonth() + 1).padStart(2, '0')}${String(
    tomorrow.getDate()
  ).padStart(2, '0')}`;
}

async function stubGoogleCalendar(page: Page): Promise<void> {
  await page
    .context()
    .route('**/calendar.google.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' })
    );
}

async function createEventFromCalendar(
  page: Page,
  title: string,
  opts: { time?: string; location?: string } = {}
): Promise<void> {
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByPlaceholder('https://...').fill('https://example.com/listing');
  await page.getByPlaceholder('Description').fill('Export me, please.');
  if (opts.location) await page.getByPlaceholder('Venue or address').fill(opts.location);
  if (opts.time) await page.getByLabel('Time (optional)').fill(opts.time);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);
}

test('timed event: Google template link and .ics download carry the snapshot', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E cal export', testInfo.project.name);

  await page.goto('/');
  await expectCalendar(page);
  await createEventFromCalendar(page, title, {
    time: '18:30',
    location: 'Signal, 175 Morgan Ave',
  });
  await openEventFromCalendar(page, title);

  // --- Google button → template link in a new tab.
  await stubGoogleCalendar(page);
  const popupPromise = page.context().waitForEvent('page');
  await page
    .getByRole('button', { name: 'Add to Google Calendar' })
    .filter({ visible: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const googleUrl = popup.url();
  await popup.close();
  expect(googleUrl).toContain('https://calendar.google.com/calendar/render');
  expect(googleUrl).toContain('action=TEMPLATE');
  expect(googleUrl).toContain(`text=${encodeURIComponent(title)}`);
  // Floating local time: 18:30 → the 1-hour block, no Z, no ctz.
  expect(googleUrl).toContain(`dates=${todayYmd()}T183000/${todayYmd()}T193000`);
  expect(googleUrl).not.toContain('ctz');
  expect(googleUrl).toContain(
    `details=${encodeURIComponent('Export me, please.\n\nhttps://example.com/listing')}`
  );
  // Location feature: the free-text venue rides the template link.
  expect(googleUrl).toContain(`location=${encodeURIComponent('Signal, 175 Morgan Ave')}`);

  // --- Apple / Outlook / Other button → .ics download.
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Add to Apple, Outlook, or another calendar' })
    .filter({ visible: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const ics = await downloadText(download);
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('END:VCALENDAR');
  expect(ics).toMatch(/UID:.+@shared-events/);
  expect(ics).toContain(`DTSTART:${todayYmd()}T183000`);
  expect(ics).toContain(`DTEND:${todayYmd()}T193000`);
  expect(ics).not.toContain('TZID');
  expect(ics).toContain(`SUMMARY:${title}`);
  expect(ics).toContain('DESCRIPTION:Export me\\, please.\\n\\nhttps://example.com/listing');
  expect(ics).toContain('LOCATION:Signal\\, 175 Morgan Ave');

  await removeOpenEvent(page);
});

test('all-day event: no time exports as a whole-day entry in both formats', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E cal export allday', testInfo.project.name);

  await page.goto('/');
  await expectCalendar(page);
  await createEventFromCalendar(page, title);
  await openEventFromCalendar(page, title);

  await stubGoogleCalendar(page);
  const popupPromise = page.context().waitForEvent('page');
  await page
    .getByRole('button', { name: 'Add to Google Calendar' })
    .filter({ visible: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  // Google's all-day form: YYYYMMDD / exclusive next day.
  expect(popup.url()).toContain(`dates=${todayYmd()}/${tomorrowYmd()}`);
  // No location was entered — no stray param (Location).
  expect(popup.url()).not.toContain('location=');
  await popup.close();

  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Add to Apple, Outlook, or another calendar' })
    .filter({ visible: true })
    .click();
  const ics = await downloadText(await downloadPromise);
  expect(ics).toContain(`DTSTART;VALUE=DATE:${todayYmd()}`);
  expect(ics).toContain(`DTEND;VALUE=DATE:${tomorrowYmd()}`);
  expect(ics).not.toContain('LOCATION');

  await removeOpenEvent(page);
});
