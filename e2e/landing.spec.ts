import { expect, test } from './fixtures';

// The beta landing page (landing/ → its own Pages project) is a static site
// with no build step and no backend — served locally here so the spec never
// touches the live deployment (receipt.spec.ts pattern). It pins the verify
// bar from FEATURES.md → Beta Landing Page: swatch toggle + persistence +
// no first-paint flash, the mailto CTA and its copyable fallback, the
// "Already testing?" footer (Android link, iOS instruction-only), noindex,
// and the link audit (no web-app links, no custom schemes, no analytics).

const LANDING_URL = process.env.E2E_LANDING_URL ?? 'http://localhost:8083';

const TEMPLATE_LINES = [
  'First and last name:',
  'Who told you about Events:',
  'iPhone or Android:',
  'If iPhone, the email your Apple ID is under:',
  'If Android, the Gmail your Play Store uses:',
];

test('renders Paper by default with the mailto CTA, fallback, and footer', async ({ page }) => {
  await page.goto(LANDING_URL);

  // Paper is the default mood, with browser chrome to match.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 247, 240)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#faf7f0');

  // The display title wears Paper's serif voice (design doc §4).
  const title = page.getByRole('heading', { name: 'Events', level: 1 });
  await expect(title).toBeVisible();
  expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Georgia');

  // The CTA is a prefilled mailto with the subject and five-line template.
  const cta = page.getByRole('link', { name: 'Ask for an invite' });
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute('href');
  expect(href).toMatch(/^mailto:kilani\.ramsey@gmail\.com\?/);
  const decoded = decodeURIComponent(href ?? '');
  expect(decoded).toContain('subject=Events beta — add me');
  for (const line of TEMPLATE_LINES) expect(decoded).toContain(line);

  // The address and template also render as copyable text (mailto is inert
  // with no mail handler).
  const fallback = page.locator('.fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText('kilani.ramsey@gmail.com');
  for (const line of TEMPLATE_LINES) await expect(fallback).toContainText(line);

  // "Already testing?" footer: Android carries the Play internal opt-in
  // link; the iPhone line is instruction-only (internal TestFlight has no
  // per-app URL).
  await expect(page.getByText('Already testing?')).toBeVisible();
  const androidLink = page.getByRole('link', { name: 'open your Play testing link' });
  await expect(androidLink).toBeVisible();
  expect(await androidLink.getAttribute('href')).toContain(
    'https://play.google.com/apps/internaltest'
  );
  const iphoneLine = page.locator('p', { hasText: 'iPhone: accept the invite email' });
  await expect(iphoneLine).toBeVisible();
  await expect(iphoneLine.locator('a')).toHaveCount(0);

  // noindex while in beta; no analytics (zero external scripts).
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('script[src]')).toHaveCount(0);

  // Link audit: every anchor is the mailto, the privacy policy (the one
  // allowed shared-events page), or the Play opt-in. No web-app links, no
  // custom-scheme URLs.
  const hrefs = await page.locator('a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const a of hrefs) {
    expect(
      a.startsWith('mailto:') ||
        a === 'https://shared-events.pages.dev/privacy.html' ||
        a.startsWith('https://play.google.com/apps/internaltest')
    ).toBe(true);
    expect(a).not.toContain('events-app://');
  }
});

test('swatch toggles to Evening, persists across reload, no first-paint flash', async ({
  page,
}) => {
  await page.goto(LANDING_URL);

  const swatch = page.getByRole('button', { name: 'Switch to Evening theme' });
  await expect(swatch).toBeVisible();
  await swatch.click();

  // Evening: tokens, browser chrome, and the swatch's destination label flip.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'evening');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 21, 26)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17151a');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to Paper theme' })).toBeVisible();
  expect(
    await page.getByRole('heading', { name: 'Events', level: 1 }).evaluate((el) => getComputedStyle(el).fontFamily)
  ).toContain('system-ui');
  expect(await page.evaluate(() => localStorage.getItem('theme_preference'))).toBe('evening');

  // The no-flash guarantee is structural: the bootstrap is the first inline
  // script in <head>, so the saved mood applies before first paint.
  const bootstrap = page.locator('head script').first();
  expect(await bootstrap.getAttribute('src')).toBeNull();
  expect(await bootstrap.textContent()).toContain('theme_preference');

  // A returning visitor lands directly in Evening — attribute and chrome are
  // already right at DOMContentLoaded, before any settle.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'evening');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17151a');

  // Toggling back returns to Paper and persists that too.
  await page.getByRole('button', { name: 'Switch to Paper theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  expect(await page.evaluate(() => localStorage.getItem('theme_preference'))).toBe('paper');
});
