import { expect, test } from './fixtures';

// The beta landing page (landing/ → its own Pages project) is a static site
// with no build step and no backend — served locally here so the spec never
// touches the live deployment (receipt.spec.ts pattern). It pins the verify
// bar from FEATURES.md → Beta Landing Page: swatch toggle + persistence +
// no first-paint flash, the mailto CTA and its copyable fallback, the
// "Already testing?" footer (Android link, iOS instruction-only), noindex,
// and the link audit (no web-app links, no custom schemes, no analytics) —
// plus the product-shot mock calendar (current month, dots, From X rows).
// Landing Page Polish (2026-09-03) added: the two-column hero (stacked on
// mobile), the accent-dot eyebrow and italic accent phrase, and the
// How-it-works principles (01/02/03, after the beta block, no header nav).

const LANDING_URL = process.env.E2E_LANDING_URL ?? 'http://localhost:8083';

const PLAY_OPT_IN_URL = 'https://play.google.com/apps/internaltest/4701427612732216042';

const TEMPLATE_LINES = [
  'First and last name:',
  'Who told you about Events:',
  'iPhone or Android:',
  'If iPhone, the email your Apple ID is under:',
  'If Android, the Gmail your Play Store uses:',
];

test('renders Paper by default with the mock, mailto CTA, fallback, and footer', async ({
  page,
}) => {
  await page.goto(LANDING_URL);

  // Paper is the default mood, with browser chrome to match.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 247, 240)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#faf7f0');

  // The hero headline is the display element and wears Paper's serif voice
  // (design doc §4).
  const hero = page.getByRole('heading', { level: 1 });
  await expect(hero).toHaveText('A calendar of events your people share with you.');
  expect(await hero.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Georgia');

  // The eyebrow carries the accent dot; with the italic phrase it is the
  // one new accent spend (owner-approved 2026-09-03). text-transform makes
  // innerText uppercase, so match the copy case-insensitively.
  const eyebrow = page.locator('.eyebrow');
  await expect(eyebrow).toHaveText(/person-to-person events/i);
  expect(await eyebrow.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe(
    'rgb(150, 104, 10)'
  );

  // The key phrase is italic in the accent.
  const em = hero.locator('.em');
  await expect(em).toHaveText('your people');
  expect(await em.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
  expect(await em.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(150, 104, 10)');

  // The product shot: a static mock of the app's calendar — current month,
  // two dotted event days, and the "From X" attribution rows.
  const mock = page.locator('#mock');
  await expect(mock).toBeVisible();
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await expect(mock.locator('#mock-month')).toHaveText(monthLabel);
  await expect(mock.locator('.mock-event')).toHaveCount(2);
  await expect(mock.locator('.mock-event .f').first()).toHaveText('From Alice');
  await expect(mock.locator('.mock-grid .sel')).toHaveCount(1);
  await expect(mock.locator('.mock-grid .dot')).toHaveCount(2);

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

  // How it works: three hairline-separated principles after the beta block
  // (the CTA stays high), renumbered 01/02/03 — the candidate's 01/02/04
  // seed gag and its missing-03 footnote do not ship.
  const how = page.locator('.how');
  await expect(how.getByRole('heading', { name: 'How it works' })).toBeVisible();
  await expect(how.locator('.principle .num')).toHaveText(['01', '02', '03']);
  await expect(how.getByRole('heading', { name: 'Person to person' })).toBeVisible();
  await expect(how.getByRole('heading', { name: 'The share is the ask' })).toBeVisible();
  await expect(how.getByRole('heading', { name: 'Quiet by design' })).toBeVisible();
  await expect(how).toContainText('Nothing is posted, and nothing is public.');
  await expect(how).toContainText('A yes or a no finds its way back to the asker');
  await expect(how).toContainText(
    'You hear from Events when a person does something, and never otherwise.'
  );
  await expect(page.getByText('There is no 03.')).toHaveCount(0);
  const betaBox = await page.locator('.beta').boundingBox();
  const howBox = await how.boundingBox();
  expect(howBox!.y).toBeGreaterThan(betaBox!.y + betaBox!.height);

  // "Already testing?" footer: Android carries the standing Play internal
  // opt-in link; the iPhone line is instruction-only (internal TestFlight
  // has no per-app URL).
  await expect(page.getByText('Already testing?')).toBeVisible();
  const androidLink = page.getByRole('link', { name: 'open your Play testing link' });
  await expect(androidLink).toBeVisible();
  expect(await androidLink.getAttribute('href')).toBe(PLAY_OPT_IN_URL);
  const iphoneLine = page.locator('p', { hasText: 'iPhone: accept the invite email' });
  await expect(iphoneLine).toBeVisible();
  await expect(iphoneLine.locator('a')).toHaveCount(0);

  // noindex while in beta; no analytics (zero external scripts).
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('script[src]')).toHaveCount(0);

  // Link audit: every anchor is the mailto, the privacy policy (the one
  // allowed shared-events page), or the Play opt-in. No web-app links, no
  // custom-scheme URLs — and no in-page anchors: the header nav was ruled
  // out 2026-09-03 (two anchors don't earn the chrome on a page this short).
  await expect(page.locator('nav')).toHaveCount(0);
  const hrefs = await page.locator('a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const a of hrefs) {
    expect(
      a.startsWith('mailto:') ||
        a === 'https://shared-events.pages.dev/privacy.html' ||
        a === PLAY_OPT_IN_URL
    ).toBe(true);
    expect(a).not.toContain('events-app://');
    expect(a.startsWith('#')).toBe(false);
  }
});

test('hero is two-column on desktop, stacked with the mock after the text on mobile', async ({
  page,
  isMobile,
}) => {
  await page.goto(LANDING_URL);

  const mockBox = await page.locator('#mock').boundingBox();
  const headBox = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(mockBox).not.toBeNull();
  expect(headBox).not.toBeNull();

  if (isMobile) {
    // Stacked: the mock sits below the sub.
    const subBox = await page.locator('.sub').boundingBox();
    expect(subBox).not.toBeNull();
    expect(mockBox!.y).toBeGreaterThanOrEqual(subBox!.y + subBox!.height);
  } else {
    // Two-column: the mock is right of the headline column and shares its
    // vertical band (grid align-items: center).
    expect(mockBox!.x).toBeGreaterThan(headBox!.x + headBox!.width);
    expect(mockBox!.y).toBeLessThan(headBox!.y + headBox!.height);
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
    await page
      .getByRole('heading', { level: 1 })
      .evaluate((el) => getComputedStyle(el).fontFamily)
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
