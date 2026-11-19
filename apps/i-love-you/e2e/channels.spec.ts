import { test, expect, newExtraContext } from './fixtures';
import { AUTH_FILE_B } from './constants';
import { channelRow, messageText, openChannel, send } from './helpers';

// Channels are generic: behavior comes only from settings either partner can
// change, and a shared setting changes for both live.
test('a shared setting changes the conversation for both; personal ones stay personal', async ({ page, browser }, testInfo) => {
  const tag = `set-${testInfo.project.name}-${Date.now()}`;
  const ctxB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const b = await ctxB.newPage();
  await page.goto('/');
  await b.goto('/');

  await openChannel(page, 'Everyday');
  await send(page, `Groceries ${tag}`);
  await openChannel(b, 'Everyday');
  await expect(messageText(b, `Groceries ${tag}`)).toBeVisible();
  await expect(b.getByTestId('item-open')).toHaveCount(0);

  // B turns on "Items can be marked done" for Everyday.
  await b.getByRole('button', { name: 'Everyday settings' }).filter({ visible: true }).click();
  const dialog = b.getByTestId('setting-items_completable');
  await dialog.click();
  await expect(dialog).toHaveAttribute('aria-checked', 'true');
  // …and mutes it for themself only.
  await b.getByLabel('Notifications: Off').click();
  await b.getByRole('button', { name: 'Close' }).click();

  // A sees the circles appear live and ticks one; B sees it done.
  await expect(page.getByTestId('item-open').first()).toBeVisible();
  await page.getByTestId('item-open').last().click();
  await expect(b.getByTestId('item-done').last()).toBeVisible();
  // B's mute is B's: A's list does not show Everyday as muted.
  if (testInfo.project.name === 'mobile-chrome') await page.getByRole('button', { name: 'Back to Channels' }).click();
  await expect(channelRow(page, 'Everyday')).toHaveAccessibleName('Everyday');
  if (testInfo.project.name === 'mobile-chrome') await openChannel(page, 'Everyday');

  // Put the shared setting back for the other specs.
  await page.getByRole('button', { name: 'Everyday settings' }).filter({ visible: true }).click();
  await page.getByTestId('setting-items_completable').click();
  await expect(page.getByTestId('setting-items_completable')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Close' }).click();
  await ctxB.close();
});

test('create from a preset, rename, reorder, archive and restore', async ({ page }, testInfo) => {
  const name = `Dreams ${testInfo.project.name === 'desktop-chrome' ? 'D' : 'M'}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Channels & order' }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'New channel' }).click();
  await page.getByLabel('Channel name').fill(name);
  await page.getByRole('radio', { name: /^Heart-to-heart:/ }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  // Opens the new channel, which starts quiet because the preset says so.
  await expect(page.getByTestId('composer-input').filter({ visible: true })).toBeVisible();
  await page.goto('/channels');
  await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: `${name} settings` })).toBeVisible();

  // Move it to the top, one step at a time, waiting for each write.
  const firstUp = page.getByRole('button', { name: /^Move .* up$/ }).first();
  for (let i = 0; i < 8 && (await firstUp.getAttribute('aria-label')) !== `Move ${name} up`; i++) {
    const before = await page.getByRole('button', { name: /^Move .* up$/ }).evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')));
    await page.getByRole('button', { name: `Move ${name} up` }).click();
    await expect
      .poll(async () => (await page.getByRole('button', { name: /^Move .* up$/ }).evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).indexOf(`Move ${name} up`))
      .toBe(before.indexOf(`Move ${name} up`) - 1);
  }
  await expect(firstUp).toHaveAttribute('aria-label', `Move ${name} up`);
  // The order is shared and persisted: it survives a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: /^Move .* up$/ }).first()).toHaveAttribute('aria-label', `Move ${name} up`);

  // Rename, then archive (no confirm — reversible) and restore.
  await page.getByRole('button', { name: `${name} settings` }).click();
  await page.getByLabel('Channel name').fill(`${name}!`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('✓ Saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Archive channel' }).click();
  await expect(page.getByRole('button', { name: `Restore ${name}!` })).toBeVisible();
  await page.getByRole('button', { name: `Restore ${name}!` }).click();
  await expect(page.getByRole('button', { name: `Move ${name}! up` })).toBeVisible();
});
