import { expect, test } from './fixtures';

// The notification explainer is native-only: web users get SMS and must never
// see the ask (nor the browser permission prompt — that half is pinned by
// smoke.spec.ts's __e2eNotificationRequests assertion).
test('notification explainer never appears on web', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Add event' })
  ).toBeVisible();

  // The gate's check runs after the first calendar fetch settles; give the
  // would-be modal a moment to (not) appear.
  await page.waitForTimeout(3000);
  await expect(
    page.getByText('Events notifies you when someone shares an event with you.')
  ).toHaveCount(0);
});
