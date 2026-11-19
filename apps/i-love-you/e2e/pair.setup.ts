import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { test, expect, newExtraContext } from './fixtures';
import { AUTH_FILE_A, AUTH_FILE_B, NAME_A, NAME_B, PHONE_A, PHONE_B } from './constants';
import { channelRow, dismissNudge, joinCouple, setName, signInWithOtp, startCouple } from './helpers';

// The standing couple every other spec uses: A starts, B joins, both land on
// the seeded channels, through the real UI.
test('pair the standing test couple', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  // A fresh database every run (local stack only), so the numbers below are
  // always brand-new people.
  if (!process.env.E2E_BASE_URL) execSync('bash e2e/stack.sh reset', { stdio: 'inherit' });
  mkdirSync('e2e/.auth', { recursive: true });
  await signInWithOtp(page, PHONE_A);
  await setName(page, NAME_A);
  const code = await startCouple(page);

  const ctxB = await newExtraContext(browser, testInfo);
  const b = await ctxB.newPage();
  await signInWithOtp(b, PHONE_B);
  await setName(b, NAME_B);
  await joinCouple(b, code);

  for (const p of [page, b]) {
    await expect(channelRow(p, 'Everyday')).toBeVisible();
    await dismissNudge(p);
  }
  await page.context().storageState({ path: AUTH_FILE_A });
  await ctxB.storageState({ path: AUTH_FILE_B });
  await ctxB.close();
});
