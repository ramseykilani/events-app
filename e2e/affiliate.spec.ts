import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
} from './helpers';

// Affiliate Link Tagging (FEATURES.md): the event-detail listing tap and the
// Add-to-calendar export bodies carry the provider's affiliate tag when the
// program is live in the registry, and pass the URL through byte-identical
// otherwise. The registry (affiliate_config + affiliate_programs REST reads)
// is route-stubbed here — the real one ships empty/all-off and tests never
// seed it. Destinations are stubbed too, so no external request leaves the
// runner. Web behavior is the CI surface; the native tap shares the code
// path (Linking.openURL).

const LISTING_URL = 'https://example.com/listing';
const TAGGED_URL = `https://affiliate.test/click?u=${encodeURIComponent(LISTING_URL)}`;

const PROGRAM = {
  id: 'example',
  domains: ['example.com'],
  url_template: 'https://affiliate.test/click?u={url}',
  enabled: true,
};

// The registry as the app's lib/affiliateRegistry.ts reads it: one PostgREST
// object read for the global switch, one array read for the programs.
async function stubRegistry(
  page: Page,
  opts: { globalEnabled: boolean; programs?: unknown[] }
): Promise<void> {
  await page.context().route('**/rest/v1/affiliate_config*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ enabled: opts.globalEnabled }),
    })
  );
  await page.context().route('**/rest/v1/affiliate_programs*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(opts.programs ?? [PROGRAM]),
    })
  );
}

async function stubDestination(page: Page, pattern: string): Promise<void> {
  await page
    .context()
    .route(pattern, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' })
    );
}

async function createEventWithUrl(page: Page, title: string, url: string): Promise<void> {
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByPlaceholder('https://...').fill(url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);
}

// Taps "Open link" on the open detail screen and returns the popup's URL.
async function tapOpenLink(page: Page): Promise<string> {
  const popupPromise = page.context().waitForEvent('page');
  await page
    .getByRole('button', { name: 'Open link' })
    .filter({ visible: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const url = popup.url();
  await popup.close();
  return url;
}

test('live program: the listing tap and the export bodies carry the tag', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E affiliate live', testInfo.project.name);

  await page.goto('/');
  await expectCalendar(page);
  await stubRegistry(page, { globalEnabled: true });
  await createEventWithUrl(page, title, LISTING_URL);
  await openEventFromCalendar(page, title);

  await stubDestination(page, '**/affiliate.test/**');
  expect(await tapOpenLink(page)).toBe(TAGGED_URL);

  // The Google template link's details carry the tagged URL too (owner
  // decision 2026-09-02: tags ride every outbound use of the listing URL).
  await stubDestination(page, '**/calendar.google.com/**');
  const popupPromise = page.context().waitForEvent('page');
  await page
    .getByRole('button', { name: 'Add to Google Calendar' })
    .filter({ visible: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const googleUrl = popup.url();
  await popup.close();
  expect(googleUrl).toContain(`details=${encodeURIComponent(TAGGED_URL)}`);

  await removeOpenEvent(page);
});

test('global switch off: the listing tap is byte-identical', async ({ page }, testInfo) => {
  const title = uniqueTitle('E2E affiliate off', testInfo.project.name);

  await page.goto('/');
  await expectCalendar(page);
  // The program row is present and enabled — the global switch alone wins.
  await stubRegistry(page, { globalEnabled: false });
  await createEventWithUrl(page, title, LISTING_URL);
  await openEventFromCalendar(page, title);

  await stubDestination(page, '**/example.com/**');
  expect(await tapOpenLink(page)).toBe(LISTING_URL);

  await removeOpenEvent(page);
});

test('uncovered provider: the listing tap is byte-identical', async ({ page }, testInfo) => {
  const title = uniqueTitle('E2E affiliate uncovered', testInfo.project.name);
  const uncoveredUrl = 'https://other-provider.test/listing';

  await page.goto('/');
  await expectCalendar(page);
  await stubRegistry(page, { globalEnabled: true });
  await createEventWithUrl(page, title, uncoveredUrl);
  await openEventFromCalendar(page, title);

  await stubDestination(page, '**/other-provider.test/**');
  expect(await tapOpenLink(page)).toBe(uncoveredUrl);

  await removeOpenEvent(page);
});
