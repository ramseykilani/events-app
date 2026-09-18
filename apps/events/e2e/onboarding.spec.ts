import { expect, test } from './fixtures';
import { expectCalendar } from './helpers';

// Walkthrough controls (M-003): reopened via the ? button, Next advances
// through all three pages, the last CTA reads Get Started, and both exits
// land back on the calendar. (The auto-show-once path needs a brand-new
// account and stays in the manual suite.)
//
// The pager renders ALL pages into the DOM at once, so page text is always
// present and proves nothing — and RN-web drops accessibilityState on the
// role-less dots, so progression is tracked via the active dot's style
// (width 8 -> 24 when selected). Next taps can race the snap animation on
// slow runners, so each advance retries, guarded against double-advancing.
test('onboarding pages advance and both exits return to the calendar', async ({
  page,
}) => {
  const dot = (n: number) => page.getByLabel(`Page ${n} of 3`);
  const isActive = async (n: number) =>
    (await dot(n).evaluate((el) => getComputedStyle(el).width)) === '24px';

  const advanceTo = async (n: number) => {
    await expect(async () => {
      if (!(await isActive(n))) await page.getByLabel('Next').click();
      await expect
        .poll(() => isActive(n), { timeout: 2000 })
        .toBe(true);
    }).toPass();
  };

  // Exit taps can also be eaten while the pager's snap animation holds the
  // gesture responder — retry until the calendar actually shows.
  const tapUntilCalendar = async (label: string) => {
    await expect(async () => {
      const onCalendar = await page
        .getByRole('button', { name: 'Add event' })
        .isVisible()
        .catch(() => false);
      if (!onCalendar) await page.getByLabel(label).click();
      await expect(
        page.getByRole('button', { name: 'Add event' })
      ).toBeVisible({ timeout: 3000 });
    }).toPass();
  };

  await page.goto('/');
  await expectCalendar(page);

  // Exit via Get Started on the last page.
  await page.getByRole('button', { name: 'Help' }).click();
  await expect.poll(() => isActive(1)).toBe(true);
  await advanceTo(2);
  await advanceTo(3);
  await expect(page.getByLabel('Get Started')).toBeVisible();
  await tapUntilCalendar('Get Started');

  // Exit early via Skip.
  await page.getByRole('button', { name: 'Help' }).click();
  await expect.poll(() => isActive(1)).toBe(true);
  await expect(page.getByLabel('Next')).toBeVisible();
  await tapUntilCalendar('Skip onboarding');
});
