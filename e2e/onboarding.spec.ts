import { expect, test } from './fixtures';
import { expectCalendar } from './helpers';

// Walkthrough controls (M-003): reopened via the ? button, Next advances
// through all three pages, the last CTA reads Get Started, and both exits
// land back on the calendar. (The auto-show-once path needs a brand-new
// account and stays in the manual suite.)
test('onboarding pages advance and both exits return to the calendar', async ({
  page,
}) => {
  await page.goto('/');
  await expectCalendar(page);

  // Exit via Get Started on the last page.
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByText('One place for events')).toBeVisible();
  await expect(page.getByLabel('Next')).toBeVisible();
  await page.getByLabel('Next').click();
  await expect(page.getByText('Add from a link or from scratch')).toBeVisible();
  await page.getByLabel('Next').click();
  await expect(page.getByText("You choose who's in")).toBeVisible();
  await expect(page.getByLabel('Get Started')).toBeVisible();
  await page.getByLabel('Get Started').click();
  await expectCalendar(page);

  // Exit early via Skip.
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByText('One place for events')).toBeVisible();
  await page.getByLabel('Skip onboarding').click();
  await expectCalendar(page);
});
