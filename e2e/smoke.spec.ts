import { expect, test } from './fixtures';

// Smoke: the signed-in calendar shell renders on every supported web form
// factor. Catches auth-redirect, RPC wiring, and theme-load regressions.
test('calendar shell renders', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('button', { name: 'Add event' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'People' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();

  // Fetch failures surface as a retry banner, never silently (project rules).
  await expect(page.getByText('Could not load events')).not.toBeVisible();
});

// Regression: web sign-in used to trigger the browser's notification
// permission prompt (registerForPushNotifications had no platform guard),
// which confused real users. Web users get SMS — the prompt must never fire.
test('never requests browser notification permission', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Add event' })
  ).toBeVisible();

  // Push registration fires in an effect after the session loads; give the
  // would-be prompt a moment to (not) happen.
  await page.waitForTimeout(3000);
  const requests = await page.evaluate(
    () =>
      (window as unknown as { __e2eNotificationRequests?: number })
        .__e2eNotificationRequests ?? 0
  );
  expect(requests).toBe(0);
});

test('navigates to People and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'People' }).click();
  await expect(
    page.getByRole('button', { name: 'Back' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(
    page.getByRole('button', { name: 'Add event' })
  ).toBeVisible();
});
