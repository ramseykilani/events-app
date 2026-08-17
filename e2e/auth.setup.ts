import { test as setup } from './fixtures';
import { ACCOUNT_A, ACCOUNT_B, signIn } from './helpers';
import { AUTH_FILE_A, AUTH_FILE_B } from './constants';

// Signs in both test accounts once per run; every project reuses the stored
// sessions (supabase-js persists them to localStorage on web, which
// Playwright captures in storageState). This keeps OTP requests to one per
// account per run instead of one per test — every signIn fires a real Twilio
// SMS at the fictional 555 test number, which Twilio rejects (21211), and
// per-test sign-ins were poisoning the account's messaging-health metrics
// (2026-08-17: ~770 rejected sends to account B in 30 days).
setup('sign in as account A', async ({ page }) => {
  await signIn(page, ACCOUNT_A);
  await page.context().storageState({ path: AUTH_FILE_A });
});

setup('sign in as account B', async ({ page }) => {
  await signIn(page, ACCOUNT_B);
  await page.context().storageState({ path: AUTH_FILE_B });
});
