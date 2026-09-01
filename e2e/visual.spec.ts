import type { Page } from '@playwright/test';
import { expect, newExtraContext, test } from './fixtures';
import { expectCalendar } from './helpers';

// Pixel-diff baselines: the cheap "nothing moved that wasn't asked to" gate.
// Runs in the normal e2e suite on every staging push, before any agent-review
// money is spent. Baselines live in e2e/visual.spec.ts-snapshots/ (per
// project). After an INTENTIONAL design change, regenerate them with the
// "Regenerate visual baselines" workflow (Actions tab → pick the screen) —
// it re-takes the pictures on CI's own runners, verifies, commits, and
// re-runs the staging pipeline. Never commit a locally regenerated
// mobile-safari baseline: WebKit text rendering depends on the installed
// fonts, and cloud-VM renders differ from CI's runners, so a baseline that
// passes locally can still fail CI (the 2026-08-17 red streak). Fallback if
// the workflow is unavailable: commit the failed run's actual render as the
// baseline — from the playwright-report artifact, the *-actual.png
// attachment (NOT *-diff.png).
//
// Stability rules that keep these deterministic:
// - The calendar clock is frozen to 2026-06-15 (a month no test ever creates
//   events in), so the grid and selected day never drift with the calendar.
// - The month grid itself is masked: dot placement depends on shared test
//   data, and nobody needs pixel police on stub data.
// - The event-detail and edit-event shots use pinned event titles and remove
//   the events after. Rows are per-user now (no global dedup), so a failed
//   run can leave residue behind: those tests first remove any leftover
//   "Baseline ..." rows, or the next run's strict-mode locator would match
//   two cards.

const SHOT = { maxDiffPixelRatio: 0.02, animations: 'disabled' as const };

// Residue guard for the pinned-title tests. The cap is a loop-safety bound,
// not a residue budget: shared accounts accumulate one row per failed run
// across every branch and CI job, so it must exceed the worst accumulation,
// not the expected case.
async function removeLeftoverEvents(page: Page, title: string): Promise<void> {
  // The day list fills asynchronously after the shell renders — without
  // waiting for the events fetch, the scan below can run against a
  // not-yet-loaded list and conclude there is no residue while rows exist.
  await page.waitForLoadState('networkidle');
  for (let i = 0; i < 30; i++) {
    const leftover = page
      .getByText(title, { exact: true })
      .filter({ visible: true })
      .first();
    if (!(await leftover.isVisible().catch(() => false))) break;
    await leftover.click();
    await expect(
      page.getByRole('button', { name: 'Remove Event' }).filter({ visible: true })
    ).toBeVisible({ timeout: 15000 });
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Remove Event' })
      .filter({ visible: true })
      .click();
    await expectCalendar(page);
  }
}

// Pinned baseline event: same title (+ location when given) every run,
// created on the frozen clock's today, removed by the test after the shot.
async function createPinnedEvent(page: Page, title: string, location?: string): Promise<void> {
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  if (location) await page.getByPlaceholder('Venue or address').fill(location);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);
}

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
  // The residue loop + pinned create + screenshot + cleanup need more than
  // the shared 90s on CI's software-rendered runners (a retry with residue
  // hit the budget mid-click).
  test.setTimeout(180000);
  await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
  await page.goto('/');
  await expectCalendar(page);

  await removeLeftoverEvents(page, 'Baseline event');

  // The pinned location renders the tappable Maps row (Location feature).
  await createPinnedEvent(page, 'Baseline event', 'Baseline Hall, 1 Main St');

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

test('edit-event form matches baseline', async ({ page }) => {
  test.setTimeout(180000);
  await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
  await page.goto('/');
  await expectCalendar(page);

  await removeLeftoverEvents(page, 'Baseline edit event');
  await createPinnedEvent(page, 'Baseline edit event', 'Baseline Hall, 1 Main St');

  await page.getByText('Baseline edit event', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByPlaceholder('Event title')).toHaveValue('Baseline edit event');
  await expect(page).toHaveScreenshot('edit-event.png', SHOT);

  // Cleanup: back to the detail, then remove the pinned event.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Event' }).filter({ visible: true })
  ).toBeVisible({ timeout: 15000 });
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Remove Event' })
    .filter({ visible: true })
    .click();
  await expectCalendar(page);
});
