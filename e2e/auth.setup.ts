import { test as setup } from './fixtures';
import { ACCOUNT_A, signIn } from './helpers';
import { AUTH_FILE_A } from './constants';

// Signs in test account A once per run; every project reuses the stored
// session (supabase-js persists it to localStorage on web, which Playwright
// captures in storageState). This keeps OTP requests to one per run instead
// of one per test.
setup('sign in as account A', async ({ page }) => {
  await signIn(page, ACCOUNT_A);
  await page.context().storageState({ path: AUTH_FILE_A });
});
