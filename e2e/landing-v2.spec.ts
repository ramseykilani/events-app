import { expect, test } from './fixtures';

// The Three-One-Four landing redesign candidate (landing-v2/ → its own
// Pages project) is a static site with no build step and no backend —
// served locally here so the spec never touches any deployment
// (landing.spec.ts pattern). It pins the same product invariants as the
// beta page — mailto CTA + copyable fallback, "Already testing?" footer,
// noindex, the link audit (no web-app links, no custom schemes, no
// analytics) — plus the seed-driven design: the 72-cell year-grid with six
// marked days, the 01/02/04 principles (the seed produced no 3), and the
// annotated colophon. Unlike the beta page it ships no JavaScript at all.

const LANDING_V2_URL = process.env.E2E_LANDING_V2_URL ?? 'http://localhost:8084';

const PLAY_OPT_IN_URL = 'https://play.google.com/apps/internaltest/4701427612732216042';

const SEED = 'yTfu92WMVLT2NcAmAuRlMN4a2ed6ql7vSw9jNw1I99QT1t9ZyPiAJ8AOIKp2Sfk8fj9uwz14';

const TEMPLATE_LINES = [
  'First and last name:',
  'Who told you about Events:',
  'iPhone or Android:',
  'If iPhone, the email your Apple ID is under:',
  'If Android, the Gmail your Play Store uses:',
];

test('renders the seed-driven design with the mailto CTA, fallback, and footer', async ({
  page,
}) => {
  await page.goto(LANDING_V2_URL);

  await expect(page).toHaveTitle('Events');
  const hero = page.getByRole('heading', { level: 1 });
  await expect(hero).toHaveText('A calendar of events your people share with you.');
  // The display voice is the serif (Georgia stack), as in Paper.
  expect(await hero.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Georgia');

  // The hero year-grid is the 72-character seed, twelve across like months;
  // the six 9s are marked days, two of them the adjacent "99" pair.
  await expect(page.locator('.year-grid .cell')).toHaveCount(72);
  await expect(page.locator('.year-grid .cell.nine')).toHaveCount(6);
  await expect(page.locator('.year-grid .cell.pair')).toHaveCount(2);
  await expect(
    page.getByText('Seventy-two days, twelve across like months')
  ).toBeVisible();

  // The principles honor the seed's missing 3: numbered 01, 02, 04.
  await expect(page.locator('.principle .num')).toHaveText(['01', '02', '04']);
  await expect(page.getByText('There is no 03.')).toBeVisible();

  // The colophon carries the full seed, annotated.
  await expect(page.locator('.seed-string')).toHaveText(new RegExp(`^${SEED}$`));

  // The CTA is a prefilled mailto with the subject and five-line template.
  const cta = page.getByRole('link', { name: 'Ask for an invite' });
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute('href');
  expect(href).toMatch(/^mailto:kilani\.ramsey@gmail\.com\?/);
  const decoded = decodeURIComponent(href ?? '');
  expect(decoded).toContain('subject=Events beta — add me');
  for (const line of TEMPLATE_LINES) expect(decoded).toContain(line);

  // The address and template also render as copyable text.
  const fallback = page.locator('.fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText('kilani.ramsey@gmail.com');
  for (const line of TEMPLATE_LINES) await expect(fallback).toContainText(line);

  // "Already testing?" footer: Android carries the standing Play internal
  // opt-in link; the iPhone line is instruction-only.
  await expect(page.getByText('Already testing?')).toBeVisible();
  const androidLink = page.getByRole('link', { name: 'open your Play testing link' });
  await expect(androidLink).toBeVisible();
  expect(await androidLink.getAttribute('href')).toBe(PLAY_OPT_IN_URL);
  const iphoneLine = page.locator('p', { hasText: 'iPhone: accept the invite email' });
  await expect(iphoneLine).toBeVisible();
  await expect(iphoneLine.locator('a')).toHaveCount(0);

  // noindex while in beta; no JavaScript at all (inline or external).
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('script')).toHaveCount(0);

  // Link audit: every anchor is the mailto, the privacy policy (the one
  // allowed shared-events page), the Play opt-in, or an in-page anchor.
  // No web-app links, no custom-scheme URLs.
  const hrefs = await page.locator('a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const a of hrefs) {
    expect(
      a.startsWith('mailto:') ||
        a.startsWith('#') ||
        a === 'https://shared-events.pages.dev/privacy.html' ||
        a === PLAY_OPT_IN_URL
    ).toBe(true);
    expect(a).not.toContain('events-app://');
  }
});

test('in-page nav anchors reach their sections', async ({ page }) => {
  await page.goto(LANDING_V2_URL);
  await page.getByRole('link', { name: 'The seed' }).click();
  await expect(page).toHaveURL(/#seed$/);
  await expect(page.locator('.seed-string')).toBeInViewport();
});
