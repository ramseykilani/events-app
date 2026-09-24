import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// The beta landing page (landing/ → its own Pages project) is a static site
// with no build step and no backend — served locally here so the spec never
// touches the live deployment (receipt.spec.ts pattern). It pins the verify
// bar from FEATURES.md → Beta Landing Page: swatch toggle + persistence +
// no first-paint flash, the "Already testing?" footer (Android link, iOS
// instruction-only), noindex, and the link audit (no web-app links, no
// custom schemes, no analytics) — plus the product-shot mock calendar
// (current month, dots, From X rows). Landing Page Polish (2026-09-03)
// added: the two-column hero (stacked on mobile), the accent-dot eyebrow
// and italic accent phrase, and the How-it-works principles (01/02/03,
// after the beta block, no header nav). Beta Signup Pipeline (2026-09-03)
// replaced the mailto CTA with a link to the signup form (./signup.html);
// the owner email stays as a quiet fallback line. Landing Page Copy Refresh
// (2026-09-24) made the hero sender-first, turned How it works into the
// find / pick / hear loop, showed both halves of the loop in the mock,
// added the FAQ page (/faq) and link-preview tags, and bans price talk.
// Video + UX pass (2026-09-24): the CTA moves into the hero, How it works
// pairs a click-to-load explainer video with the steps, and the beta block
// becomes the closing ask after How it works.

const LANDING_URL = process.env.E2E_LANDING_URL ?? 'http://localhost:8083';
const FAQ_URL = `${LANDING_URL}/faq.html`;
const OG_IMAGE_URL = 'https://events-landing.pages.dev/og-image.png';
const PRIVACY_URL = 'https://shared-events.pages.dev/privacy.html';

const PLAY_OPT_IN_URL = 'https://play.google.com/apps/internaltest/4701427612732216042';
const VIDEO_URL = 'https://youtu.be/sCRhrfuBjQo';

// og:image must be absolute, so it points at the production host; the file
// itself ships in landing/ and must be a real 1200×630 card.
async function expectLinkPreview(page: Page, url: string) {
  const og = (p: string) => page.locator(`meta[property="og:${p}"]`);
  await expect(og('title')).toHaveAttribute('content', /\S/);
  await expect(og('description')).toHaveAttribute('content', /\S/);
  await expect(og('url')).toHaveAttribute('content', url);
  await expect(og('image')).toHaveAttribute('content', OG_IMAGE_URL);
  await expect(og('image:width')).toHaveAttribute('content', '1200');
  await expect(og('image:height')).toHaveAttribute('content', '630');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image'
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
  const size = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, `${LANDING_URL}/og-image.png`);
  expect(size).toEqual([1200, 630]);
}

test('renders Paper by default with the mock, signup CTA, fallback, and footer', async ({
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
  await expect(hero).toHaveText('Going to something? Tell your people once.');
  expect(await hero.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Georgia');
  await expect(page.locator('.sub')).toHaveText(
    "Share it with the people you'd want there. It lands on their calendar, or as a text if they don't have the app. They tell you if they're coming."
  );

  // The eyebrow carries the accent dot; with the italic phrase it is the
  // one new accent spend (owner-approved 2026-09-03). text-transform makes
  // innerText uppercase, so match the copy case-insensitively.
  const eyebrow = page.locator('.eyebrow');
  // A quiet label, not a second slogan (owner 2026-09-24: the "For things
  // you're going to anyway" pitch read as too prominent).
  await expect(eyebrow).toHaveText(/shows · games · openings/i);
  expect(await eyebrow.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe(
    'rgb(150, 104, 10)'
  );

  // The key phrase is italic in the accent.
  const em = hero.locator('.em');
  await expect(em).toHaveText('Tell your people');
  expect(await em.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
  expect(await em.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(150, 104, 10)');

  // The product shot: a static mock of the app's calendar — current month,
  // two dotted event days, and both halves of the loop: a row a friend
  // shared (From X, in the accent) and one you shared, with its head-count
  // (secondary — the accent's in-app jobs stay three).
  const mock = page.locator('#mock');
  await expect(mock).toBeVisible();
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await expect(mock.locator('#mock-month')).toHaveText(monthLabel);
  await expect(mock.locator('.mock-event')).toHaveCount(2);
  await expect(mock.locator('.mock-event .t')).toHaveText([
    'Jazz at the Bandshell',
    'Gallery opening',
  ]);
  await expect(mock.locator('.mock-event .f')).toHaveText(['From Alice']);
  const coming = mock.locator('.mock-event .c');
  await expect(coming).toHaveText(['3 coming']);
  expect(await coming.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(107, 99, 87)');
  await expect(mock.locator('.mock-event').nth(1)).toContainText('You shared with 6');
  await expect(mock.locator('.mock-grid .sel')).toHaveCount(1);
  await expect(mock.locator('.mock-grid .dot')).toHaveCount(2);

  // Status copy is "closed beta"; the CTA verb stays "Get the beta"
  // (owner 2026-09-05). Fulfillment is automated, so the stale "invites go
  // out personally" line is gone, and install guidance lives on the signup
  // confirmation, not here.
  await expect(page.getByRole('heading', { level: 2, name: 'In closed beta' })).toBeVisible();
  await expect(page.locator('.beta')).toContainText(
    'Events is in closed beta on iPhone and Android.'
  );
  await expect(page.locator('.beta')).toContainText('your invite comes to you automatically');
  await expect(page.locator('.beta')).not.toContainText('personally');
  await expect(page.locator('.beta')).not.toContainText('Apple sends two emails');

  // The CTA links to the signup form (Beta Signup Pipeline — it replaced
  // the prefilled mailto once the form was verified live). It appears
  // twice: in the hero (with the one-line beta status under it) and as the
  // closing ask — the same verb and destination both times.
  const ctas = page.getByRole('link', { name: 'Get the beta' });
  await expect(ctas).toHaveCount(2);
  for (const cta of await ctas.all()) {
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute('href')).toBe('/signup');
  }
  await expect(page.locator('.hero .cta')).toHaveText('Get the beta');
  await expect(page.locator('.hero .cta-note')).toHaveText('Closed beta · iPhone and Android');

  // The owner email stays as a quiet copyable fallback line.
  const fallback = page.locator('.fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText('kilani.ramsey@gmail.com');

  // How it works: the loop as three hairline-separated steps, beside the
  // explainer video, right after the hero (the hero carries the CTA now),
  // numbered 01/02/03 — the candidate's
  // 01/02/04 seed gag and its missing-03 footnote do not ship. The old
  // principles survive as one closing line, followed by the quiet FAQ link.
  const how = page.locator('.how');
  await expect(how.getByRole('heading', { name: 'How it works' })).toBeVisible();
  await expect(how.locator('.principle .num')).toHaveText(['01', '02', '03']);
  await expect(how.locator('.principle h3')).toHaveText([
    'Find something',
    'Pick your people',
    "Hear who's in",
  ]);
  await expect(how).toContainText('The name and picture usually fill themselves in.');
  await expect(how).toContainText('Anyone without the app gets a text with the details.');
  await expect(how).toContainText('Only you see the answers.');
  await expect(how).toContainText(
    'Nothing is posted and nothing is public. Events only speaks up when a person shares something with you or answers you.'
  );
  await expect(how.getByRole('link', { name: 'Read the FAQ' })).toHaveAttribute('href', '/faq');
  await expect(page.getByText('There is no 03.')).toHaveCount(0);

  // No price talk anywhere (owner 2026-09-24: "it's just noise").
  await expect(page.locator('body')).not.toContainText(/\bfree\b|\bprice\b|\$\d/i);
  // Order: hero (with its CTA) → How it works → the closing beta block.
  const betaBox = await page.locator('.beta').boundingBox();
  const howBox = await how.boundingBox();
  const heroBottom = await page.locator('.hero').boundingBox();
  expect(howBox!.y).toBeGreaterThanOrEqual(heroBottom!.y + heroBottom!.height);
  expect(betaBox!.y).toBeGreaterThan(howBox!.y + howBox!.height);

  // One 1080px measure for the whole page: hero, beta, How it works, and
  // footer share the same width and left edge (owner call 2026-09-03 —
  // narrower below-hero sections read ragged against the wide hero).
  const heroBox = await page.locator('.hero').boundingBox();
  const footerBox = await page.locator('footer').boundingBox();
  for (const box of [betaBox, howBox, footerBox]) {
    expect(box!.width).toBe(heroBox!.width);
    expect(box!.x).toBe(heroBox!.x);
  }

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

  // noindex until the store listings are public (owner 2026-09-24); no
  // analytics (zero external scripts).
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('script[src]')).toHaveCount(0);

  // Link previews: a pasted link shows a real card, not a bare "Events".
  await expectLinkPreview(page, 'https://events-landing.pages.dev/');

  // Link audit: every anchor is the signup form, the FAQ, the privacy
  // policy (the one allowed shared-events page), the Play opt-in, or the
  // explainer video (the click-to-load poster's no-JS fallback). No
  // web-app links, no custom-scheme URLs — and no in-page anchors: the
  // header nav was ruled out 2026-09-03 (two anchors don't earn the chrome
  // on a page this short).
  await expect(page.locator('nav')).toHaveCount(0);
  const hrefs = await page.locator('a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const a of hrefs) {
    expect(
      a === '/signup' ||
        a === '/faq' ||
        a === PRIVACY_URL ||
        a === PLAY_OPT_IN_URL ||
        a === VIDEO_URL
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
    // Stacked: the sub, then the CTA — a phone visitor meets the ask before
    // scrolling past the mock — then the mock.
    const subBox = await page.locator('.sub').boundingBox();
    const ctaBox = await page.locator('.hero .cta').boundingBox();
    expect(subBox).not.toBeNull();
    expect(ctaBox!.y).toBeGreaterThanOrEqual(subBox!.y + subBox!.height);
    expect(mockBox!.y).toBeGreaterThanOrEqual(ctaBox!.y + ctaBox!.height);
  } else {
    // Two-column: the mock is right of the headline column and shares its
    // vertical band (grid align-items: center). The mock carries the
    // column at 480px — wider than the pre-polish 380px cap.
    expect(mockBox!.x).toBeGreaterThan(headBox!.x + headBox!.width);
    expect(mockBox!.y).toBeLessThan(headBox!.y + headBox!.height);
    expect(mockBox!.width).toBeGreaterThan(380);
  }
});

test('explainer video is click-to-load: nothing from YouTube until play is pressed', async ({
  page,
  isMobile,
}) => {
  // Record every third-party request the page makes on open.
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(LANDING_URL)) external.push(req.url());
  });
  await page.goto(LANDING_URL);

  const how = page.locator('.how');
  const poster = how.getByRole('link', { name: 'Play the Events video' });
  await expect(poster).toBeVisible();
  await expect(poster).toHaveAttribute('href', VIDEO_URL);
  await expect(poster).toContainText('Watch it in action');
  // A real 16:9 frame, not a thumbnail-sized chip.
  const box = await poster.boundingBox();
  expect(Math.abs(box!.width / box!.height - 16 / 9)).toBeLessThan(0.02);

  // Desktop: the video sits left of the steps; phones: stacked, video first.
  const stepsBox = await how.locator('.steps').boundingBox();
  if (isMobile) expect(stepsBox!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
  else expect(stepsBox!.x).toBeGreaterThanOrEqual(box!.x + box!.width);

  // Nothing third-party loads on open (no-analytics rule).
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(external).toEqual([]);

  // Pressing play swaps the poster for the privacy-enhanced embed in place.
  // Block the embed itself so the spec never depends on YouTube.
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.abort());
  await poster.click();
  const frame = how.locator('#video iframe');
  await expect(frame).toHaveCount(1);
  expect(await frame.getAttribute('src')).toBe(
    'https://www.youtube-nocookie.com/embed/sCRhrfuBjQo?autoplay=1&rel=0&playsinline=1'
  );
  await expect(frame).toHaveAttribute('title', /video/i);
  await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(page.url()).toBe(`${LANDING_URL}/`);
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

test('FAQ page: grouped questions open natively, quiet links, no price talk', async ({ page }) => {
  await page.goto(FAQ_URL);

  // Same object as the landing page: Paper by default, serif H1, swatch.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#faf7f0');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText('Questions people ask');
  expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Georgia');
  await expect(page.getByRole('button', { name: 'Switch to Evening theme' })).toBeVisible();

  // Four groups; questions are native <details>, closed until asked.
  await expect(page.locator('.group h2')).toHaveText([
    'The basics',
    'Sharing',
    'Your calendar',
    'Your account',
  ]);
  const questions = page.locator('details');
  expect(await questions.count()).toBeGreaterThanOrEqual(15);
  for (const d of await questions.all()) {
    expect(await d.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  }

  const q = page.locator('details', { hasText: 'Do my friends need the app?' });
  const answer = q.locator('p');
  await expect(answer).toBeHidden();
  await q.locator('summary').click();
  await expect(answer).toBeVisible();
  await expect(answer).toContainText('Anyone without it gets a text');
  // Summaries are real 44pt+ targets.
  const box = await q.locator('summary').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // No price talk anywhere, open or closed (owner 2026-09-24).
  await expect(page.locator('body')).not.toContainText(/\bfree\b|\bprice\b|\$\d/i);

  // Ends on the one CTA; the wordmark leads home.
  const cta = page.getByRole('link', { name: 'Get the beta' });
  await expect(cta).toHaveAttribute('href', '/signup');
  await expect(page.getByRole('link', { name: 'Events home' })).toHaveAttribute('href', '/');
  await expect(page.locator('main')).toContainText('kilani.ramsey@gmail.com');

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('script[src]')).toHaveCount(0);
  await expectLinkPreview(page, 'https://events-landing.pages.dev/faq');

  const hrefs = await page.locator('a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  for (const a of hrefs) {
    expect(a === '/' || a === '/signup' || a === PRIVACY_URL).toBe(true);
  }
});

test('FAQ swatch shares the landing page mood', async ({ page }) => {
  await page.goto(LANDING_URL);
  await page.getByRole('button', { name: 'Switch to Evening theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'evening');

  await page.goto(FAQ_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'evening');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17151a');
  await page.getByRole('button', { name: 'Switch to Paper theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  expect(await page.evaluate(() => localStorage.getItem('theme_preference'))).toBe('paper');
});
