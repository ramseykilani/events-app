import { test as setup } from './fixtures';
import type { Page } from '@playwright/test';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  ACCOUNT_PASSWORD,
  signIn,
  signInWithPassword,
} from './helpers';
import { AUTH_FILE_A, AUTH_FILE_B } from './constants';

// Signs in both test accounts once per run; every project reuses the stored
// sessions (supabase-js persists them to localStorage on web, which
// Playwright captures in storageState). This keeps sign-ins to one per
// account per run instead of one per test.
//
// With E2E_ACCOUNT_PASSWORD set (the norm — scripts/create-test-accounts.mjs)
// sign-in goes through the token endpoint and fires no SMS at all. Without
// it, the fallback drives the OTP UI. Registered test numbers are in
// sms_test_otp, so that request returns message_id "test-otp" and does not
// call Twilio. The OTP UI itself stays covered by auth.spec.ts; that is the
// product surface.
// A brand-new account pair has zero events, and the calendar auto-shows the
// walkthrough once for empty accounts (app/(app)/index.tsx →
// maybeShowOnboarding, ±1-year window). The dismissal flag already rides the
// storageState into every test context, so specs never see it — this seed is
// defense in depth: one pinned PAST event keeps the auto-show condition
// false even if the flag path regresses. The row stays invisible to every
// spec: frozen-clock baselines render 2026-06-15 with the month grid masked,
// and no spec asserts an empty calendar. Idempotent — a no-op once any row
// exists in the window. Runs against REST directly so it works for both the
// password and OTP-UI sign-in paths.
async function seedCalendarIfEmpty(page: Page): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const session = await page.evaluate(() => {
    for (const k of Object.keys(window.localStorage)) {
      if (!k.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(k);
      if (raw) {
        return JSON.parse(raw) as {
          access_token?: string;
          user?: { id?: string };
        };
      }
    }
    return null;
  });
  if (!session?.access_token || !session.user?.id) {
    throw new Error('seed guard: no supabase session in localStorage after sign-in');
  }
  const headers = {
    apikey: key,
    authorization: `Bearer ${session.access_token}`,
    'content-type': 'application/json',
  };
  const year = new Date().getFullYear();
  const list = await fetch(`${url}/rest/v1/rpc/get_calendar_events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_user_id: session.user.id,
      p_start_date: `${year - 1}-01-01`,
      p_end_date: `${year + 1}-12-31`,
    }),
  });
  if (!list.ok) {
    throw new Error(
      `seed guard: get_calendar_events failed: ${list.status} ${await list.text()}`
    );
  }
  const rows = (await list.json()) as unknown[];
  if (rows.length > 0) return;
  // Dated last December: always inside the ±1-year window, always past, and
  // never on the frozen-clock day (2026-06-15) or any run's "today".
  const create = await fetch(`${url}/rest/v1/rpc/save_event`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_id: crypto.randomUUID(),
      p_url: null,
      p_title: 'Seed event',
      p_description: null,
      p_image_url: null,
      p_location: null,
      p_event_date: `${year - 1}-12-15`,
      p_event_time: null,
    }),
  });
  if (!create.ok) {
    throw new Error(
      `seed guard: save_event failed: ${create.status} ${await create.text()}`
    );
  }
  console.log(`seed guard: empty calendar — pinned seed event created (${year - 1}-12-15)`);
}

setup('sign in as account A', async ({ page }) => {
  if (ACCOUNT_PASSWORD) {
    await signInWithPassword(page, ACCOUNT_A);
  } else {
    await signIn(page, ACCOUNT_A);
  }
  await seedCalendarIfEmpty(page);
  await page.context().storageState({ path: AUTH_FILE_A });
});

setup('sign in as account B', async ({ page }) => {
  if (ACCOUNT_PASSWORD) {
    await signInWithPassword(page, ACCOUNT_B);
  } else {
    await signIn(page, ACCOUNT_B);
  }
  await seedCalendarIfEmpty(page);
  await page.context().storageState({ path: AUTH_FILE_B });
});
