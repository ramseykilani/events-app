import { test, expect, newExtraContext } from './fixtures';
import { AUTH_FILE_B } from './constants';
import { channelRow, messageText, openChannel, send } from './helpers';

// Messaging between the two sessions, live: send, the partner's quiet unread
// dot (never a number), receive without refresh, reply, edit, react, delete.
test('two people message each other live', async ({ page, browser }, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const ctxB = await newExtraContext(browser, testInfo, AUTH_FILE_B, { width: 390, height: 844 });
  const b = await ctxB.newPage();
  await page.goto('/');
  await b.goto('/');
  await expect(channelRow(b, 'Everyday')).toBeVisible();

  await openChannel(page, 'Everyday');
  await send(page, `Dinner at 7? ${tag}`);
  await expect(messageText(page, `Dinner at 7? ${tag}`)).toBeVisible();

  // Partner: the dot appears live, and it is a dot, not a count.
  await expect(b.getByTestId('unread-dot-Everyday')).toBeAttached();
  await expect(channelRow(b, 'Everyday')).toHaveAccessibleName(/Everyday, unread/);
  await openChannel(b, 'Everyday');
  await expect(messageText(b, `Dinner at 7? ${tag}`)).toBeVisible();

  // Reply from the partner arrives on A without a refresh.
  await send(b, `Yes ${tag}`);
  await expect(messageText(page, `Yes ${tag}`)).toBeVisible();

  // A edits their message; B sees the edit.
  await page.getByTestId('composer-input').filter({ visible: true }).press('ArrowUp');
  await page.getByTestId('composer-input').filter({ visible: true }).fill(`Dinner at 7:30? ${tag}`);
  await page.getByRole('button', { name: 'Save edit' }).click();
  await expect(messageText(b, `Dinner at 7:30? ${tag}`)).toBeVisible();
  await expect(b.getByText(/edited/).filter({ visible: true }).first()).toBeVisible();

  // A reacts to B's message through the actions sheet; B sees who.
  await messageText(page, `Yes ${tag}`).hover();
  await page.getByRole('button', { name: 'Message actions' }).click();
  await page.getByRole('button', { name: 'React Love' }).click();
  await expect(b.getByRole('button', { name: `Love from ${'Ramsey'}. Add yours` })).toBeVisible();

  // A deletes their own message (confirmed); it disappears for both.
  await messageText(page, `Dinner at 7:30? ${tag}`).hover();
  await page.getByRole('button', { name: 'Message actions' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(messageText(b, `Dinner at 7:30? ${tag}`)).toHaveCount(0);
  await expect(b.getByText('Message deleted').filter({ visible: true }).first()).toBeVisible();
  await ctxB.close();
});

test('history survives a reload and a sent message is never duplicated', async ({ page }, testInfo) => {
  const tag = `reload-${testInfo.project.name}-${Date.now()}`;
  await page.goto('/');
  await openChannel(page, 'Everyday');
  await send(page, tag);
  await expect(messageText(page, tag)).toHaveCount(1);
  // Reload lands back in the same conversation (desktop and phone): cache
  // first, then the server — one copy either way.
  await page.reload();
  await expect(messageText(page, tag)).toHaveCount(1);
});

test('move a message to the channel it belongs in, keeping its author', async ({ page, browser }, testInfo) => {
  const tag = `move-${testInfo.project.name}-${Date.now()}`;
  const ctxB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const b = await ctxB.newPage();
  await b.goto('/');
  await openChannel(b, 'Everyday');
  await send(b, `I've been thinking about us ${tag}`);

  // A moves B's message into Heart-to-heart.
  await page.goto('/');
  await openChannel(page, 'Everyday');
  await messageText(page, tag).hover();
  await page.getByRole('button', { name: 'Message actions' }).click();
  await page.getByRole('button', { name: 'Move to another channel', exact: true }).click();
  await page.getByRole('button', { name: 'Move to Heart-to-heart' }).click();
  await expect(messageText(page, tag)).toHaveCount(0);

  // It lives in Heart-to-heart now, for both, still B's, marked as moved.
  if (testInfo.project.name === 'mobile-chrome') await page.getByRole('button', { name: 'Back to Channels' }).click();
  await openChannel(page, 'Heart-to-heart');
  await expect(messageText(page, tag)).toBeVisible();
  await expect(page.getByText(/Moved from Everyday/).filter({ visible: true }).first()).toBeVisible();
  await expect(messageText(b, tag)).toHaveCount(0);
  await ctxB.close();
});
