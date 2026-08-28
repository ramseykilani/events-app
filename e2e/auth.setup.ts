import { test as setup } from './fixtures';
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
// it, the fallback drives the OTP UI, and each sign-in fires a real Twilio
// SMS at the fictional 555 test number, which Twilio rejects (21211) —
// per-test sign-ins were poisoning the account's messaging-health metrics
// (2026-08-17: ~770 rejected sends to account B in 30 days). The OTP UI
// itself stays covered by auth.spec.ts; that is the product surface.
setup('sign in as account A', async ({ page }) => {
  if (ACCOUNT_PASSWORD) {
    await signInWithPassword(page, ACCOUNT_A);
  } else {
    await signIn(page, ACCOUNT_A);
  }
  await page.context().storageState({ path: AUTH_FILE_A });
});

setup('sign in as account B', async ({ page }) => {
  if (ACCOUNT_PASSWORD) {
    await signInWithPassword(page, ACCOUNT_B);
  } else {
    await signIn(page, ACCOUNT_B);
  }
  await page.context().storageState({ path: AUTH_FILE_B });
});
