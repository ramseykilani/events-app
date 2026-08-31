import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
  visibleText,
} from './helpers';

// Adjacent-Month Event Dots (FEATURES.md, E-117): the grid's greyed overflow
// days belong to the previous/next month, and events on them must carry the
// same accent dot as in-month days. The fetch window is the visible grid, not
// the calendar month.
//
// The suite runs on the live date (only visual.spec freezes the clock), so
// the overflow target is computed at runtime: the previous month's last day
// is in the grid whenever the 1st isn't a Sunday; otherwise the next month's
// 1st is, whenever the last day isn't a Saturday. A 28-day February starting
// on Sunday is the one grid with no overflow days at all — there the test
// steps one month forward (such a March always shows April overflow days).
//
// No negative "unmarked overflow day" assertion: the account's calendar is
// shared test data, so no specific date is guaranteed event-free. The
// per-date marking mapping is covered deterministically in
// __tests__/components/Calendar.test.tsx.

function toDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function overflowTarget(now: Date): { date: Date; stepForward: boolean } {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (new Date(year, month, 1).getDay() !== 0) {
    return { date: new Date(year, month, 0), stepForward: false };
  }
  if (new Date(year, month + 1, 0).getDay() !== 6) {
    return { date: new Date(year, month + 1, 1), stepForward: false };
  }
  return { date: new Date(year, month + 2, 1), stepForward: true };
}

// The Dot view renders for every day (opacity 0 when unmarked), so the
// assertion reads the computed style of the 4x4 dot inside the day cell.
async function readDot(page: Page, dateString: string) {
  return page.getByTestId(`calendar.day_${dateString}`).evaluate((el) => {
    for (const d of Array.from(el.querySelectorAll('div'))) {
      const cs = getComputedStyle(d);
      if (cs.width === '4px' && cs.height === '4px') {
        return { opacity: cs.opacity, backgroundColor: cs.backgroundColor };
      }
    }
    return null;
  });
}

test('event on an adjacent-month overflow day shows the accent dot', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E overflow dot', testInfo.project.name);
  const { date, stepForward } = overflowTarget(new Date());
  const dateString = toDateString(date);

  await page.goto('/');
  await expectCalendar(page);
  if (stepForward) {
    await page.getByTestId('calendar.rightArrow').click();
  }

  // Create the event on the overflow day via the web add-event flow.
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByLabel('Date', { exact: true }).fill(dateString);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);

  // Paper accent #c8871e — the same dot in-month days get.
  await expect
    .poll(() => readDot(page, dateString), { timeout: 15000 })
    .toEqual({ opacity: '1', backgroundColor: 'rgb(200, 135, 30)' });

  // Tapping the overflow day flips the month and lists the event.
  await page.getByTestId(`calendar.day_${dateString}`).click();
  await expect(visibleText(page, title)).toBeVisible();
  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});
