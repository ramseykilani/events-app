import { expect, test } from '@playwright/test';

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
