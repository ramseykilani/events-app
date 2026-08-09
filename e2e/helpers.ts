import { expect, type Page } from '@playwright/test';

// Test OTP accounts configured on the Supabase project (see AGENTS.md →
// "Signing in (test OTP)"). Both expire March 31, 2027. They are documented
// in the repo, so defaults here are not secrets; override via env to point
// the suite at a different project.
export const ACCOUNT_A = {
  phone: process.env.E2E_PHONE_A ?? '+15555550100',
  otp: process.env.E2E_OTP_A ?? '123456',
};
export const ACCOUNT_B = {
  phone: process.env.E2E_PHONE_B ?? '+15555550103',
  otp: process.env.E2E_OTP_B ?? '123456',
};
// Display name account A uses for account B in My People. The share test is
// idempotent: if this person already exists it is reused, not re-added.
export const PERSON_B_NAME = 'E2E Account B';

export async function signIn(
  page: Page,
  account: { phone: string; otp: string }
): Promise<void> {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Send code' })
  ).toBeVisible();
  await page.getByLabel('Phone number').fill(account.phone);
  await page.getByRole('button', { name: 'Send code' }).click();

  const codeInput = page.getByLabel('Verification code');
  await expect(codeInput).toBeVisible();
  await codeInput.fill(account.otp);
  await page.getByTestId('verify-button').click();

  await dismissOnboardingIfShown(page);
  await expectCalendar(page);
}

// The walkthrough auto-pushes at most once for accounts with zero events.
// Test accounts usually have events from prior runs, but a fresh Supabase
// project (or a wiped account) lands here — dismiss it so the calendar shows.
export async function dismissOnboardingIfShown(page: Page): Promise<void> {
  const skip = page.getByLabel('Skip onboarding');
  try {
    await skip.waitFor({ state: 'visible', timeout: 8000 });
    await skip.click();
  } catch {
    // Walkthrough did not appear — already on the calendar.
  }
}

export async function expectCalendar(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: 'Add event' })
  ).toBeVisible({ timeout: 15000 });
}

export function uniqueTitle(prefix: string, projectName: string): string {
  return `${prefix} ${projectName} ${Date.now()}`;
}

// The calendar opens on today and both add/remove flows operate on the
// selected day, so every e2e event is created for today.
export async function openEventFromCalendar(
  page: Page,
  title: string
): Promise<void> {
  await page.getByText(title, { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Event' })
  ).toBeVisible({ timeout: 15000 });
}

// "Remove Event" confirms via window.confirm on web (lib/dialogs.ts).
export async function removeOpenEvent(page: Page): Promise<void> {
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove Event' }).click();
  await expectCalendar(page);
}
