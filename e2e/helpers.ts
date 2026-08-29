import { expect, type Dialog, type Page } from '@playwright/test';

// Test accounts configured on the Supabase project (see AGENTS.md →
// "Signing in (test accounts)"). Test OTPs expire March 31, 2027. They are
// documented in the repo, so defaults here are not secrets; override via env
// to point the suite at a different project — or to claim a pool account
// pair (C–F: +15555550110–113) so a parallel local run never races the
// standing accounts' calendars.
export const ACCOUNT_A = {
  phone: process.env.E2E_PHONE_A ?? '+15555550100',
  otp: process.env.E2E_OTP_A ?? '123456',
};
export const ACCOUNT_B = {
  phone: process.env.E2E_PHONE_B ?? '+15555550103',
  otp: process.env.E2E_OTP_B ?? '123456',
};
// Shared password for every test account (scripts/create-test-accounts.mjs).
// When set, the auth setup signs in via the token endpoint — no SMS fired.
// When unset, it falls back to driving the OTP UI. Registered test numbers
// use sms_test_otp (message_id test-otp) and do not call Twilio.
export const ACCOUNT_PASSWORD = process.env.E2E_ACCOUNT_PASSWORD ?? '';
// Display name account A uses for account B in My People. The share test is
// idempotent: if this person already exists it is reused, not re-added.
export const PERSON_B_NAME = 'E2E Account B';

export async function signIn(
  page: Page,
  account: { phone: string; otp: string }
): Promise<void> {
  // Clear any persisted session first: a shared account whose session was
  // revoked by a later sign-in would otherwise boot into a permanently
  // loading screen instead of the sign-in form.
  await page.context().clearCookies();
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
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

// Signs in with phone + password via the token endpoint and seeds the
// session into localStorage before app code runs — no UI, no SMS. The app
// persists its session under sb-<project-ref>-auth-token (supabase-js
// default storage key; AsyncStorage falls back to localStorage on web), and
// Playwright's storageState then captures it for the browser projects. Not
// used by auth.spec.ts: the OTP UI is the product surface and stays covered
// there.
export async function signInWithPassword(
  page: Page,
  account: { phone: string }
): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'signInWithPassword needs EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY in the environment (or .env)'
    );
  }
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: key },
    body: JSON.stringify({
      phone: account.phone,
      password: ACCOUNT_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `password sign-in failed for ${account.phone}: ${res.status} ${await res.text()}`
    );
  }
  const session = await res.json();
  // auth-js computes expires_at client-side when it persists a session; the
  // raw token response only carries expires_in.
  session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  await page.context().addInitScript(
    ([k, v]: string[]) => window.localStorage.setItem(k, v),
    [storageKey, JSON.stringify(session)]
  );
  await page.goto('/');
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

// On the People screen, upsert a person via the web manual-add form.
export async function addPersonManually(
  page: Page,
  name: string,
  phone: string
): Promise<void> {
  await page
    .getByRole('button', { name: 'Add', exact: true })
    .first()
    .click();
  // Two modal-timing hazards, both observed on CI: (1) exact-match the
  // placeholder — the circle form's "New circle name" input stays mounted
  // under the modal and contains "Name" as a substring; (2) the modal can
  // briefly double-mount during its open animation on slower runners
  // (webkit), so wait for exactly one input before filling.
  const nameInput = page.getByPlaceholder('Name', { exact: true });
  await expect(nameInput).toHaveCount(1);
  await nameInput.fill(name);
  const phoneInput = page.getByPlaceholder('+1 416 555 1234');
  await expect(phoneInput).toHaveCount(1);
  await phoneInput.fill(phone);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Exact: the calendar stacked underneath shows "From <name>" attribution
  // cards, which a substring match would also hit.
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  // The modal's slide-out keeps the main screen's inputs unfocusable until it
  // fully unmounts (~1s on web) — wait for its content to leave the DOM.
  // (Exact match: the circle form's "New circle name" placeholder contains
  // "Name" as a substring.)
  await expect(page.getByPlaceholder('Name', { exact: true })).toBeHidden();
}

// Sharing requires a saved display name (the "X wants to go to ... with
// you" attribution). The gate appears on the share screen only while the
// account has no name — once any run saves one it sticks server-side, so
// this is a no-op afterwards.
export async function fillNameGateIfShown(page: Page): Promise<void> {
  const nameInput = page.getByLabel('Your name');
  try {
    await nameInput.waitFor({ state: 'visible', timeout: 8000 });
    await nameInput.fill('E2E User');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(nameInput).toBeHidden();
  } catch {
    // Account already has a display name — no gate.
  }
}

// From the calendar: create an event for today and share it with PERSON_B_NAME.
// Ends back on the calendar with the event visible.
export async function createEventAndShareToB(
  page: Page,
  title: string
): Promise<void> {
  // A failed create/share surfaces via showError → window.alert on web, which
  // Playwright would otherwise auto-dismiss and hide the real error behind a
  // downstream "event not found" timeout. Fail loudly with the message.
  let errorDialog: string | null = null;
  const onDialog = (dialog: Dialog) => {
    errorDialog = dialog.message();
    void dialog.accept();
  };
  page.on('dialog', onDialog);
  try {
    await expectCalendar(page);
    await page.getByRole('button', { name: 'Add event' }).click();
    await page.getByPlaceholder('Event title').fill(title);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Share with')).toBeVisible();
    await fillNameGateIfShown(page);
    // Self-verifying selection: a tap that races a list re-render can be eaten
    // (the row node gets replaced mid-click), leaving Share disabled forever.
    // Retry until the row's selection circle fills — guarded so an
    // already-selected row isn't toggled back off by the retry. Match the row
    // by role, not text-parent: the name sits inside a nested View since Share
    // Delivery Status wrapped it (a `.locator('..')` chain lands on that
    // wrapper, not the row), and covered nav screens stay mounted, so filter
    // to the visible copy. Selection is a circle indicator (circle =
    // selectable, ✓ = confirmed/done), so the retry keys off the circle's
    // testID; the accessible name no longer changes on selection.
    const rowB = page
      .getByRole('button', { name: PERSON_B_NAME })
      .filter({ visible: true });
    await expect(async () => {
      if (!(await rowB.getByTestId('selection-circle-selected').isVisible().catch(() => false))) {
        await rowB.click();
      }
      await expect(rowB.getByTestId('selection-circle-selected')).toBeVisible({ timeout: 2000 });
    }).toPass();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    // Share Sent Confirmation: the screen stays open with a persistent
    // "✓ Sent to N people" line — the sender leaves via Done.
    await expect(
      page.getByText('✓ Sent to 1 person').filter({ visible: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expectCalendar(page);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    expect(errorDialog).toBeNull();
  } finally {
    page.off('dialog', onDialog);
  }
}

// React Navigation keeps covered screens mounted in the DOM (display:none on
// web), so a text/role locator can resolve to elements on both the visible
// screen and the one underneath. Assert against the visible copy.
export function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

// The calendar opens on today and both add/remove flows operate on the
// selected day, so every e2e event is created for today.
export async function openEventFromCalendar(
  page: Page,
  title: string
): Promise<void> {
  await visibleText(page, title).click();
  await expect(
    page.getByRole('button', { name: 'Remove Event' }).filter({ visible: true })
  ).toBeVisible({ timeout: 15000 });
}

// "Remove Event" confirms via window.confirm on web (lib/dialogs.ts).
export async function removeOpenEvent(page: Page): Promise<void> {
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Remove Event' })
    .filter({ visible: true })
    .click();
  await expectCalendar(page);
}
