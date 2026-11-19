import { test, expect, newExtraContext } from './fixtures';
import { LOCAL_OTP } from './constants';

// Sign-in: phone validation, the OTP step, a wrong code, and landing on
// pairing for a brand-new person. Runs signed out.
test('phone sign-in validates, verifies, and a new person lands on pairing', async ({ browser }, testInfo) => {
  const ctx = await newExtraContext(browser, testInfo);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'I Love You' })).toBeVisible();

  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await page.getByLabel('Phone number').fill('123');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect.poll(() => dialogs.join('|')).toContain('valid phone number');

  await page.getByLabel('Phone number').fill(`+1 555 555 02${testInfo.project.name === 'desktop-chrome' ? '06' : '07'}`);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Verification code').fill('000000');
  await page.getByTestId('verify-button').click();
  await expect.poll(() => dialogs.join('|')).toContain('incorrect or no longer valid');

  await page.getByLabel('Verification code').fill(LOCAL_OTP);
  await page.getByTestId('verify-button').click();
  await expect(page.getByRole('heading', { name: 'What should your partner call you?' })).toBeVisible();
  await ctx.close();
});
