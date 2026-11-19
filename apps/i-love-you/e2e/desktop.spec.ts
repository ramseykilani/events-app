import { test, expect } from './fixtures';
import { messageText } from './helpers';

// Desktop is the web build done properly: two panes, keyboard shortcuts,
// Enter to send. Skipped on the phone project, which keeps one column.
test('two panes and keyboard shortcuts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'desktop layout');
  await page.goto('/');
  await expect(page.getByText('Choose a channel.')).toBeVisible();
  await expect(page.getByTestId('channel-row-Everyday')).toBeVisible();

  // Order is the couple's (other specs reorder), so read it off the list.
  const names = await page
    .locator('[data-testid^="channel-row-"]')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('channel-row-', '')));
  await page.keyboard.press('Control+2');
  await expect(page.getByRole('heading', { name: names[1], exact: true })).toBeVisible();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByRole('heading', { name: names[2], exact: true })).toBeVisible();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByRole('heading', { name: names[1], exact: true })).toBeVisible();
  // The list is still there beside the conversation.
  await expect(page.getByTestId('channel-row-Everyday')).toBeVisible();

  const tag = `enter-${Date.now()}`;
  const input = page.getByTestId('composer-input');
  await input.fill(`line one ${tag}`);
  await input.press('Shift+Enter');
  await input.type('line two');
  await input.press('Enter');
  await expect(messageText(page, `line one ${tag}`)).toBeVisible();
  await expect(input).toHaveValue('');
});

test('phone keeps one column with Back to the list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'phone layout');
  await page.goto('/');
  await page.getByTestId('channel-row-Logistics').click();
  await expect(page.getByTestId('channel-row-Logistics').filter({ visible: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to Channels' }).click();
  await expect(page.getByTestId('channel-row-Logistics').filter({ visible: true })).toBeVisible();
});
