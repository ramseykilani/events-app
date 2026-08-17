import { expect, newExtraContext, test } from './fixtures';
import { expectCalendar } from './helpers';

// Pixel-diff baselines: the cheap "nothing moved that wasn't asked to" gate.
// Runs in the normal e2e suite on every staging push, before any agent-review
// money is spent. Baselines live in e2e/visual.spec.ts-snapshots/ (per
// project); regenerate them after INTENTIONAL design changes with:
//   npx playwright test e2e/visual.spec.ts --update-snapshots
// and review the diffs in the PR like any other change.
// CI is the authority, not the local machine: WebKit text rendering depends
// on the installed fonts, and cloud-VM renders differ from CI's runners, so
// a baseline that passes locally can still fail CI. If a baseline fails only
// in CI, commit that run's actual render as the baseline — from the
// playwright-report artifact, the *-actual.png attachment (NOT *-diff.png).
//
// Stability rules that keep these deterministic:
// - The calendar clock is frozen to 2026-06-15 (a month no test ever creates
//   events in), so the grid and selected day never drift with the calendar.
// - The month grid itself is masked: dot placement depends on shared test
//   data, and nobody needs pixel police on stub data.
// - The event-detail shot uses a pinned event created idempotently
//   (find_or_create_event dedups by title+date+time) and removed after.

const SHOT = { maxDiffPixelRatio: 0.02, animations: 'disabled' as const };

test('sign-in screen matches baseline', async ({ browser }, testInfo) => {
  const context = await newExtraContext(browser, testInfo);
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Send code' })
    ).toBeVisible();
    await expect(
      page.getByText("Found something you want to go to", { exact: false })
    ).toBeVisible();
    await expect(page).toHaveScreenshot('sign-in.png', SHOT);
  } finally {
    await context.close();
  }
});

test('onboarding page matches baseline', async ({ page }) => {
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByText('One place for events')).toBeVisible();
  await expect(page).toHaveScreenshot('onboarding.png', SHOT);
});

test('calendar shell matches baseline (frozen clock)', async ({ page }) => {
  // Freeze the date (and ONLY the date — faking timers would stall RN-web's
  // scheduler) before the app boots so the calendar renders June 2026.
  await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
  await page.goto('/');
  await expectCalendar(page);
  await expect(page).toHaveScreenshot('calendar.png', {
    ...SHOT,
    // The month grid (aria role "slider" from react-native-calendars) shows
    // event dots driven by shared test data — mask it.
    mask: [page.getByRole('slider')],
  });
});

test('add-event form matches baseline', async ({ page }) => {
  // Frozen clock too: the date input would otherwise embed the live date and
  // the baseline would diff every day.
  await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.getByPlaceholder('Event title')).toBeVisible();
  await expect(page).toHaveScreenshot('add-event.png', SHOT);
});

test('event detail matches baseline', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
  await page.goto('/');
  await expectCalendar(page);

  // Pinned baseline event: same title+date+time every run, so the server-side
  // dedup reuses one row instead of accumulating test data.
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill('Baseline event');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);

  await page.getByText('Baseline event', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Event' })
  ).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveScreenshot('event-detail.png', SHOT);

  // Cleanup: the calendar's day list stays deterministically empty next run.
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Remove Event' })
    .filter({ visible: true })
    .click();
  await expectCalendar(page);
});
