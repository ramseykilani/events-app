import { test, expect, newExtraContext } from './fixtures';
import { channelRow, joinCouple, setName, signInWithOtp, startCouple } from './helpers';

// Pairing: the two-person invariant through the UI. A code works once; after
// two people pair, a third person entering the same code is refused, and
// stopping the wait kills the code.
test('a couple is exactly two people', async ({ browser }, testInfo) => {
  const n = testInfo.project.name === 'desktop-chrome' ? ['02', '03', '04'] : ['05', '08', '09'];
  const open = async () => (await newExtraContext(browser, testInfo)).newPage();
  const one = await open();
  const two = await open();
  const three = await open();

  await signInWithOtp(one, `+155555502${n[0]}`);
  await setName(one, 'One');
  const code = await startCouple(one);
  await expect(one.getByText('Waiting for your partner to join…')).toBeVisible();

  await signInWithOtp(two, `+155555502${n[1]}`);
  await setName(two, 'Two');
  await joinCouple(two, code);
  await expect(channelRow(two, 'Everyday')).toBeVisible();
  // The creator's waiting screen moves on by itself (Realtime + bounded poll).
  await expect(channelRow(one, 'Heart-to-heart')).toBeVisible();
  await expect(one.getByRole('heading', { name: 'Two' })).toBeVisible();

  const dialogs: string[] = [];
  three.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await signInWithOtp(three, `+155555502${n[2]}`);
  await setName(three, 'Three');
  await joinCouple(three, code);
  await expect.poll(() => dialogs.join('|')).toContain('did not match');
  await expect(three.getByRole('button', { name: 'Join' })).toBeVisible();

  // Three can still start their own space — just not join someone else's.
  await three.getByRole('button', { name: 'I don’t have a code' }).click();
  await startCouple(three);
  await three.getByRole('button', { name: 'Stop waiting' }).click();
  await expect(three.getByRole('button', { name: 'Start our space' })).toBeVisible();
});
