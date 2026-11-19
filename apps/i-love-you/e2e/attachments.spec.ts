import { test, expect, newExtraContext } from './fixtures';
import { AUTH_FILE_B } from './constants';
import { openChannel } from './helpers';

// Attachments through the real Storage bucket and its couple-folder RLS:
// a photo picked through the browser's file chooser, and a voice note
// recorded with MediaRecorder (Chromium's fake microphone). The partner
// receives both live and can load them (signed URLs).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64'
);

test('a photo and a voice note reach the partner', async ({ page, browser }, testInfo) => {
  const ctxB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const b = await ctxB.newPage();
  await page.goto('/');
  await b.goto('/');
  await openChannel(page, 'Heart-to-heart');
  await openChannel(b, 'Heart-to-heart');
  const photosBefore = await b.getByRole('button', { name: 'Photo. Open full screen', exact: true }).filter({ visible: true }).count();
  const voiceBefore = await b.getByRole('button', { name: 'Play voice note', exact: true }).filter({ visible: true }).count();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Send a photo' }).filter({ visible: true }).click();
  await (await chooser).setFiles({ name: 'us.png', mimeType: 'image/png', buffer: PNG });
  await expect(b.getByRole('button', { name: 'Photo. Open full screen', exact: true }).filter({ visible: true })).toHaveCount(photosBefore + 1);
  // The partner's copy loads from Storage through a signed URL.
  await expect
    .poll(async () =>
      b.locator('img').evaluateAll((imgs) => imgs.some((i) => (i as HTMLImageElement).src.includes('/storage/v1/object/sign/attachments/')))
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Record a voice note' }).filter({ visible: true }).click();
  await expect(page.getByText(/Recording \d:\d\d/)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Send voice note' }).click();
  await expect(b.getByRole('button', { name: 'Play voice note', exact: true }).filter({ visible: true })).toHaveCount(voiceBefore + 1);
  await ctxB.close();
});
