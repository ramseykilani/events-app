import { test, expect } from './fixtures';

// The family theme control: the swatch previews the next mood and the choice
// persists across reloads.
test('theme swatch cycles Paper and Evening and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to Evening theme' }).first().click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to Paper theme' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Paper theme' }).first().click();
  await expect(page.getByRole('button', { name: 'Switch to Evening theme' }).first()).toBeVisible();
});
