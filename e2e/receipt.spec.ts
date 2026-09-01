import type { Download } from '@playwright/test';
import { expect, test } from './fixtures';

// The Who's Coming receipt page (receipt/index.html → events-reply.pages.dev)
// is a static site with no build step and no auth — served locally here with
// its one API (send-response) route-mocked, so the spec never touches the
// live deployment. It pins two things: the page's Add to Other Calendars
// links (an inline vanilla-JS port of lib/calendarLinks.ts — the app's Jest
// suite pins the original, this spec pins the port against the same
// expectations) and the inert-GET rule (loading the page never writes).

const RECEIPT_URL = process.env.E2E_RECEIPT_URL ?? 'http://localhost:8082';
// Obviously-fake fixture UUID (SQL-suite style) — secret scanners flag
// real-looking UUIDs assigned to TOKEN, and this one never leaves the mock.
const TOKEN = 'ffffffff-0000-0000-0000-000000000001';

const STATE = {
  askerName: 'Alice',
  title: 'Board Game Night',
  date: '2026-09-05',
  time: '19:00:00',
  description: 'Bring a game.',
  location: 'Signal, 175 Morgan Ave',
  url: 'https://example.com/tickets',
  response: null,
};

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('download has no stream');
  let data = '';
  for await (const chunk of stream) data += chunk;
  return data;
}

test('receipt page renders the calendar links and stays inert on load', async ({ page }) => {
  const apiMethods: string[] = [];
  await page.route('**/functions/v1/send-response**', async (route) => {
    const method = route.request().method();
    apiMethods.push(method);
    if (method === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(STATE) });
    } else {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ response: 'yes', changed: true }),
      });
    }
  });

  await page.goto(`${RECEIPT_URL}/?t=${TOKEN}`);
  await expect(page.getByText('Alice asked')).toBeVisible();
  // Location feature: the venue line renders between the when and the links.
  await expect(page.getByText('Signal, 175 Morgan Ave', { exact: true })).toBeVisible();

  // The Google link is a plain anchor pre-filled from the event.
  const google = page.getByRole('link', { name: 'Add to Google Calendar' });
  await expect(google).toBeVisible();
  const href = await google.getAttribute('href');
  expect(href).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
  expect(href).toContain('text=Board%20Game%20Night');
  expect(href).toContain('dates=20260905T190000/20260905T200000');
  expect(href).not.toContain('ctz');
  expect(href).toContain(
    `details=${encodeURIComponent('Bring a game.\n\nhttps://example.com/tickets')}`
  );
  expect(href).toContain(`location=${encodeURIComponent('Signal, 175 Morgan Ave')}`);

  // The .ics button downloads the same snapshot (UID derives from the
  // send's token — the GET deliberately exposes no event id).
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Apple / Outlook / Other (.ics)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('board-game-night.ics');
  const ics = await downloadText(download);
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain(`UID:${TOKEN}@shared-events`);
  expect(ics).toContain('DTSTART:20260905T190000');
  expect(ics).toContain('DTEND:20260905T200000');
  expect(ics).not.toContain('TZID');
  expect(ics).toContain('SUMMARY:Board Game Night');
  expect(ics).toContain('DESCRIPTION:Bring a game.\\n\\nhttps://example.com/tickets');
  expect(ics).toContain('LOCATION:Signal\\, 175 Morgan Ave');

  // Loading + linking fired GETs only — the write still requires a tap.
  expect(apiMethods.every((m) => m === 'GET')).toBe(true);

  // The answer flow is unaffected by the new links.
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true');
  expect(apiMethods).toContain('POST');
});

test('receipt page exports an all-day event when there is no time', async ({ page }) => {
  await page.route('**/functions/v1/send-response**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...STATE, time: null, description: null, location: null, url: null }),
    })
  );

  await page.goto(`${RECEIPT_URL}/?t=${TOKEN}`);
  // No location — the venue line stays hidden (Location).
  await expect(page.locator('#location')).toBeHidden();
  const google = page.getByRole('link', { name: 'Add to Google Calendar' });
  await expect(google).toBeVisible();
  const href = await google.getAttribute('href');
  expect(href).toContain('dates=20260905/20260906');
  expect(href).not.toContain('details=');
  expect(href).not.toContain('location=');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Apple / Outlook / Other (.ics)' }).click();
  const ics = await downloadText(await downloadPromise);
  expect(ics).toContain('DTSTART;VALUE=DATE:20260905');
  expect(ics).toContain('DTEND;VALUE=DATE:20260906');
  expect(ics).not.toContain('DESCRIPTION');
  expect(ics).not.toContain('LOCATION');
});
