import { expect, type Page } from '@playwright/test';
import { LOCAL_OTP } from './constants';

// Drives the real OTP UI (the local stack's test_otp returns the code
// without any SMS provider).
export async function signInWithOtp(page: Page, phone: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Verification code').fill(LOCAL_OTP);
  await page.getByTestId('verify-button').click();
}

export async function setName(page: Page, name: string): Promise<void> {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
}

// Creator side: start a couple and read the code off the screen.
export async function startCouple(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Start our space' }).click();
  const code = await page.getByTestId('invite-code').innerText();
  return code.replace(/\s/g, '');
}

export async function joinCouple(page: Page, code: string): Promise<void> {
  await page.getByRole('button', { name: 'Enter a code' }).click();
  await page.getByLabel("Partner's code").fill(code);
  await page.getByRole('button', { name: 'Join' }).click();
}

// The notification explainer card is a one-time first-run surface; specs
// that are not about it answer Not now once (persisted in storage).
export async function dismissNudge(page: Page): Promise<void> {
  const notNow = page.getByRole('button', { name: 'Not now' });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
}

export function channelRow(page: Page, name: string) {
  return page.getByTestId(`channel-row-${name}`).filter({ visible: true }).first();
}

export function messageText(page: Page, text: string) {
  return page.locator('[data-testid^="message-"]').filter({ visible: true }).getByText(text, { exact: false });
}

export async function openChannel(page: Page, name: string): Promise<void> {
  await channelRow(page, name).click();
  await expect(page.getByTestId('composer-input').filter({ visible: true })).toBeVisible();
}

export async function send(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('composer-input').filter({ visible: true });
  await input.fill(text);
  await page.getByTestId('send-button').filter({ visible: true }).click();
}
