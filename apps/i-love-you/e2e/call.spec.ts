import { test, expect, newExtraContext } from './fixtures';
import { AUTH_FILE_B } from './constants';
import { channelRow } from './helpers';

// The drop-in room over a real LiveKit dev server (e2e/stack.sh): A sits in
// the room without ringing; B sees "Ramsey is in your room", joins with one
// tap, and both are connected with media flowing (Chromium's fake devices).
// The dock keeps the call alive across navigation.
test('drop-in room: sit in, partner joins, call survives navigation', async ({ page, browser }, testInfo) => {
  const ctxB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const b = await ctxB.newPage();
  await page.goto('/room');
  await b.goto('/');
  await expect(channelRow(b, 'Everyday')).toBeVisible();

  await page.getByRole('button', { name: 'Sit in the room' }).click();
  await expect(page.getByTestId('call-status')).toHaveText(/Waiting for Natasha/);

  const join = b.getByRole('button', { name: 'Join Ramsey in your room' });
  await expect(join).toBeVisible();
  await join.click();
  await expect(page.getByTestId('call-status')).toHaveText(/With Natasha/, { timeout: 30_000 });
  await expect(b.getByTestId('call-dock')).toContainText('With Ramsey');

  // B turns the camera on; A receives a playing video track.
  await b.getByRole('button', { name: /Open the room/ }).click();
  await b.getByRole('switch', { name: 'Camera' }).click();
  await expect
    .poll(async () => page.locator('video').evaluateAll((vs) => vs.some((v) => (v as HTMLVideoElement).videoWidth > 0)), {
      timeout: 30_000,
    })
    .toBe(true);

  // Navigating away keeps the call; the dock is there and can leave.
  await b.getByRole('button', { name: 'Back to Channels' }).click();
  await expect(b.getByTestId('call-dock')).toBeVisible();
  await b.getByRole('button', { name: 'Leave the room' }).click();
  await expect(page.getByTestId('call-status')).toHaveText(/Waiting for Natasha/, { timeout: 30_000 });
  await page.getByRole('switch', { name: 'Leave' }).click();
  await expect(page.getByRole('button', { name: 'Sit in the room' })).toBeVisible();
  await ctxB.close();
});
