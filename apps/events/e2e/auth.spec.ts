import { expect, newExtraContext, test } from './fixtures';
import { ACCOUNT_A, ACCOUNT_B } from './helpers';

// Signed-out auth flows (M-001, M-002) run in a fresh context with no stored
// session. None of these complete a successful OTP verify — the setup project
// covers the happy path once per run, and extra sign-ins churn sessions on
// the shared test accounts.

test('invalid phone number shows a friendly alert (M-001)', async ({
  browser,
}, testInfo) => {
  const context = await newExtraContext(browser, testInfo);
  try {
    const page = await context.newPage();
    // Capture-and-poll, not waitForEvent('dialog'): an alert fired
    // synchronously inside the click handler can race the wait registration
    // and leave it hanging in current Playwright.
    let dialogMessage: string | null = null;
    page.on('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.accept();
    });
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Send code' })
    ).toBeVisible();

    await page.getByLabel('Phone number').fill('abc');
    await page.getByRole('button', { name: 'Send code' }).click();

    await expect
      .poll(() => dialogMessage, { message: 'alert to fire' })
      .toContain('Invalid phone number');

    // Incomplete numeric stubs used to parse as +1123 and hit Twilio, which
    // dumped sms_send_failed via showError. They must stay client-side.
    dialogMessage = null;
    await page.getByLabel('Phone number').fill('123');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect
      .poll(() => dialogMessage, { message: 'alert to fire for numeric stub' })
      .toContain('Invalid phone number');
    expect(dialogMessage).not.toMatch(/sms_send_failed|twilio/i);

    // Still on the sign-in form — no navigation happened.
    await expect(page.getByLabel('Phone number')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('sign-in shows the SMS consent line and legal links (A2P opt-in CTA)', async ({
  browser,
}, testInfo) => {
  // The 10DLC campaign's registered opt-in evidence is the sign-in screen at
  // the production URL — this copy is what the TCR reviewer verifies
  // (docs/a2p-registration.md). If it regresses, the campaign re-rejects.
  const context = await newExtraContext(browser, testInfo);
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(
      page.getByText(
        /agree to receive SMS sign-in codes from Shared Events/
      )
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Terms of service' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Privacy policy' })
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('verify screen starts the resend cooldown and rejects a wrong code (M-002)', async ({
  browser,
}, testInfo) => {
  const context = await newExtraContext(browser, testInfo);
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByLabel('Phone number').fill(ACCOUNT_B.phone);
    await page.getByRole('button', { name: 'Send code' }).click();

    // Send code hits sms_test_otp (message_id test-otp) and does not call
    // Twilio. The cooldown still exists so a double-tap cannot fire a second
    // request inside Auth's max-frequency window.
    const codeInput = page.getByLabel('Verification code');
    await expect(codeInput).toBeVisible();
    await expect(page.getByText(/Resend code in \d+s/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Resend code/ })
    ).toBeDisabled();

    // A wrong code surfaces a short friendly alert, not a debug dump.
    let dialogMessage: string | null = null;
    page.on('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.accept();
    });
    await codeInput.fill('000000');
    await page.getByTestId('verify-button').click();
    await expect
      .poll(() => dialogMessage, { message: 'alert to fire' })
      .toContain('incorrect or no longer valid');
    expect(dialogMessage).not.toMatch(/\{|stack|AuthApiError/);

    // Form recovers: user can retry immediately.
    await expect(page.getByTestId('verify-button')).toBeEnabled();
  } finally {
    await context.close();
  }
});

test('verify screen offers a wrong-number exit (UX-04)', async ({
  browser,
}, testInfo) => {
  // Account A: M-002's wrong-code run above already spent B's OTP send inside
  // Auth's max-frequency window — a second send to the same number would be
  // rate-limited and the screen would never leave sign-in.
  const context = await newExtraContext(browser, testInfo);
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByLabel('Phone number').fill(ACCOUNT_A.phone);
    await page.getByRole('button', { name: 'Send code' }).click();

    // The subtitle renders the number formatted, never raw E.164 (UX-27).
    // Derive the expectation from the account — the pool pair varies per run.
    const digits = ACCOUNT_A.phone.replace(/\D/g, '').slice(-10);
    const formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    await expect(page.getByLabel('Verification code')).toBeVisible();
    await expect(page.getByText(formatted)).toBeVisible();

    // Sign-in router.replace()s to verify, so the exit is an explicit action.
    await page.getByRole('button', { name: 'Wrong number?' }).click();
    await expect(page.getByLabel('Phone number')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send code' })
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
