import { expect, newExtraContext, test } from './fixtures';
import { ACCOUNT_A } from './helpers';

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

    // Still on the sign-in form — no navigation happened.
    await expect(page.getByLabel('Phone number')).toBeVisible();
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
    await page.getByLabel('Phone number').fill(ACCOUNT_A.phone);
    await page.getByRole('button', { name: 'Send code' }).click();

    // The initial send starts the 60s cooldown so an accidental tap can't
    // fire a second SMS.
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
