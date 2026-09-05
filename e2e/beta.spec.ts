import { expect, test } from './fixtures';

// The beta signup form (landing/signup.html → events-landing.pages.dev/signup)
// is a static page in the landing project — served locally by the same
// webServer as landing.spec.ts, with its one API (beta-signup) route-mocked,
// so the spec never touches the live deployment (receipt.spec.ts pattern).
// It pins the verify bar from FEATURES.md → Beta Signup Pipeline: inline
// validation errors, platform-conditional fields, the normalized POST
// payload, per-platform confirmation copy, noindex, and the link audit.
//
// Local-vs-live URL note: `serve -s` rewrites unknown clean paths to
// index.html, so the spec navigates to /signup.html; Cloudflare Pages serves
// the same file at clean /signup (what the SMS invite line links) — verified
// post-deploy with curl.

const LANDING_URL = process.env.E2E_LANDING_URL ?? 'http://localhost:8083';
const SIGNUP_URL = `${LANDING_URL}/signup.html`;

const IOS_SUBMISSION = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  platform: 'ios',
  appleEmail: 'ada@example.com',
};

const ANDROID_SUBMISSION = {
  firstName: 'Grace',
  lastName: 'Hopper',
  platform: 'android',
  playEmail: 'grace@gmail.com',
  phone: '(416) 555-1234',
};

function mockApi(page: import('@playwright/test').Page, responder: (payload: unknown) => { status: number; body: unknown }) {
  const payloads: unknown[] = [];
  page.route('**/functions/v1/beta-signup**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      payloads.push(request.postDataJSON());
    }
    const result = responder(payloads[payloads.length - 1]);
    await route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });
  return payloads;
}

async function fillValidIos(page: import('@playwright/test').Page): Promise<void> {
  await page.getByLabel('First name').fill('Ada');
  await page.getByLabel('Last name').fill('Lovelace');
  await page.locator('label.option', { hasText: 'iPhone' }).click();
  await page.getByLabel('The email your Apple ID is under').fill('ada@example.com');
}

test('renders the form with conditional fields hidden until a platform is chosen', async ({
  page,
}) => {
  await mockApi(page, () => ({ status: 200, body: { status: 'ok' } }));
  await page.goto(SIGNUP_URL);

  // Paper is the default mood, with browser chrome to match.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#faf7f0');
  // noindex while in beta (landing precedent).
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');

  await expect(page.locator('.eyebrow')).toHaveText(/events closed beta/i);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Get the beta.');
  await expect(page.getByRole('button', { name: 'Join the beta' })).toBeVisible();

  // Neither platform's fields render before a choice.
  await expect(page.locator('#ios-fields')).toBeHidden();
  await expect(page.locator('#android-fields')).toBeHidden();

  // iPhone reveals only the Apple ID email; Android reveals Gmail + phone;
  // switching back and forth never strands the wrong block.
  await page.locator('label.option', { hasText: 'iPhone' }).click();
  await expect(page.locator('#ios-fields')).toBeVisible();
  await expect(page.locator('#android-fields')).toBeHidden();
  await page.locator('label.option', { hasText: 'Android' }).click();
  await expect(page.locator('#ios-fields')).toBeHidden();
  await expect(page.locator('#android-fields')).toBeVisible();
  await page.locator('label.option', { hasText: 'Both' }).click();
  await expect(page.locator('#ios-fields')).toBeVisible();
  await expect(page.locator('#android-fields')).toBeVisible();
});

test('invalid submissions get inline errors and never reach the API', async ({ page }) => {
  const payloads = mockApi(page, () => ({ status: 200, body: { status: 'ok' } }));
  await page.goto(SIGNUP_URL);

  // Empty form: names and platform flagged.
  await page.getByRole('button', { name: 'Join the beta' }).click();
  await expect(page.locator('#first-name-error')).toHaveText('First name is required.');
  await expect(page.locator('#last-name-error')).toHaveText('Last name is required.');
  await expect(page.locator('#platform-error')).toHaveText('Choose iPhone, Android, or both.');

  // Android without Gmail/phone, then with a malformed Gmail.
  await page.getByLabel('First name').fill('Grace');
  await page.getByLabel('Last name').fill('Hopper');
  await page.locator('label.option', { hasText: 'Android' }).click();
  await page.getByRole('button', { name: 'Join the beta' }).click();
  await expect(page.locator('#play-email-error')).toHaveText('Enter the Gmail your Play Store uses.');
  await expect(page.locator('#phone-error')).toHaveText(
    'Enter your phone number so we can text you the testing link.'
  );
  await page.getByLabel('The Gmail your Play Store uses').fill('not-an-email');
  await page.getByLabel('Your phone number').fill('(416) 555-1234');
  await page.getByRole('button', { name: 'Join the beta' }).click();
  await expect(page.locator('#play-email-error')).toHaveText("That Gmail address doesn't look right.");

  expect(payloads).toHaveLength(0);
});

test('iOS submit posts the normalized payload and shows the Apple-emails confirmation', async ({
  page,
}) => {
  const payloads = mockApi(page, () => ({ status: 200, body: { status: 'ok', id: 'x' } }));
  await page.goto(SIGNUP_URL);
  await fillValidIos(page);
  await page.getByRole('button', { name: 'Join the beta' }).click();

  expect(payloads).toEqual([IOS_SUBMISSION]);

  await expect(page.locator('#confirmation')).toBeVisible();
  await expect(page.locator('#confirmation-title')).toHaveText("You're on the list.");
  await expect(page.locator('#confirmation-ios')).toBeVisible();
  await expect(page.locator('#confirmation-ios')).toContainText('ada@example.com');
  await expect(page.locator('#confirmation-ios')).toContainText('Accept the first');
  await expect(page.locator('#confirmation-android')).toBeHidden();
  await expect(page.locator('#signup-form')).toBeHidden();
});

test('Android submit posts Gmail + phone and shows the text-incoming confirmation', async ({
  page,
}) => {
  const payloads = mockApi(page, () => ({ status: 200, body: { status: 'ok', id: 'x' } }));
  await page.goto(SIGNUP_URL);
  await page.getByLabel('First name').fill('Grace');
  await page.getByLabel('Last name').fill('Hopper');
  await page.locator('label.option', { hasText: 'Android' }).click();
  await page.getByLabel('The Gmail your Play Store uses').fill('grace@gmail.com');
  await page.getByLabel('Your phone number').fill('(416) 555-1234');
  await page.getByRole('button', { name: 'Join the beta' }).click();

  expect(payloads).toEqual([ANDROID_SUBMISSION]);

  await expect(page.locator('#confirmation-android')).toBeVisible();
  await expect(page.locator('#confirmation-android')).toContainText('(416) 555-1234');
  await expect(page.locator('#confirmation-android')).toContainText('Chrome');
  await expect(page.locator('#confirmation-ios')).toBeHidden();
});

test('an already-signed-up response still lands on the confirmation', async ({ page }) => {
  mockApi(page, () => ({ status: 200, body: { status: 'existing' } }));
  await page.goto(SIGNUP_URL);
  await fillValidIos(page);
  await page.getByRole('button', { name: 'Join the beta' }).click();
  await expect(page.locator('#confirmation')).toBeVisible();
});

test('server rejections surface the error and leave the form usable', async ({ page }) => {
  mockApi(page, () => ({ status: 429, body: { error: 'Too many signups - try again tomorrow.' } }));
  await page.goto(SIGNUP_URL);
  await fillValidIos(page);
  await page.getByRole('button', { name: 'Join the beta' }).click();

  await expect(page.locator('#form-error')).toHaveText('Too many signups - try again tomorrow.');
  await expect(page.locator('#signup-form')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join the beta' })).toBeEnabled();
  await expect(page.locator('#confirmation')).toBeHidden();
});

test('link audit: no web-app or custom-scheme links, privacy link only', async ({ page }) => {
  await mockApi(page, () => ({ status: 200, body: { status: 'ok' } }));
  await page.goto(SIGNUP_URL);
  const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors.map((a) => a.getAttribute('href'))
  );
  for (const href of hrefs) {
    expect(href).toBe('https://shared-events.pages.dev/privacy.html');
  }
  // One privacy link, next to the form disclosure — not also in a footer.
  expect(hrefs).toHaveLength(1);
});

test('theme swatch toggles to Evening, persists, and syncs browser chrome', async ({ page }) => {
  await mockApi(page, () => ({ status: 200, body: { status: 'ok' } }));
  await page.goto(SIGNUP_URL);
  const swatch = page.getByRole('button', { name: 'Switch to Evening theme' });
  await swatch.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'evening');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17151a');
  await expect(page.getByRole('button', { name: 'Switch to Paper theme' })).toBeVisible();

  // Persistence: a reload comes back in Evening with no Paper flash.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'evening');
});
