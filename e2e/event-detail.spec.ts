import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
  visibleText,
} from './helpers';

// Event detail actions (M-007, with M-006's disabled-state check): Share opens
// the share sheet (which refuses to share with zero selection), Edit saves the
// caller's own row in place (Copy + Follow: one save_event call, no fork) and
// the detail shows the new values, Remove deletes only the caller's row.
// Dates must render formatted, never raw YYYY-MM-DD. The edit step exercises
// EVERY field — KI-004 shipped a read-only URL input while every test layer
// only ever edited the title; fill() fails on a read-only input, so this is
// the guard.
test('event detail: share sheet, edit in place, formatted date, remove', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E detail', testInfo.project.name);
  const editedTitle = `${title} edited`;

  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();

  // Share screen: the header action is disabled until someone is picked.
  await expect(page.getByText('Share with')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Share', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Open the detail from the calendar.
  await expectCalendar(page);
  await openEventFromCalendar(page, title);
  await expect(visibleText(page, title)).toBeVisible();
  // Display dates come from lib/format.ts (e.g. "Sun, Aug 9"), never raw ISO.
  await expect(page.getByText(/\d{4}-\d{2}-\d{2}/)).not.toBeVisible();
  // No location was entered — the Maps row renders nothing (Location).
  await expect(page.getByRole('button', { name: /in Maps$/ })).toHaveCount(0);
  // A self-created event has no Hide action — that rides the sharedByPersonId
  // nav param, which only received events carry (KI-016: guards the DOM truth
  // directly, independent of the haunted CI pixel render).
  await expect(
    page.getByRole('button', { name: /^(Hide|Unhide) / }).filter({ visible: true })
  ).toHaveCount(0);

  // Share from detail routes to the same sheet and back.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByText('Share with')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Event' })
  ).toBeVisible();

  // Edit updates the caller's row in place; the detail shows the new values.
  // Every field is edited, not just the title. The date moves to a different
  // day in the same month (the calendar lists events per selected day, so
  // the date edit is proven by where the event lands afterwards).
  const editedUrl = 'https://example.com/e2e-edited';
  const editedDescription = `${title} details updated`;
  const editedLocation = 'Signal, 175 Morgan Ave';
  const now = new Date();
  const newDay = now.getDate() === 15 ? 16 : 15;
  const editedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
  // Same formatting calls the detail screen makes (lib/format.ts).
  const expectedDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    newDay
  ).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const expectedTime = new Date('1970-01-01T18:30:00').toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  await page.getByRole('button', { name: 'Edit' }).click();
  const titleInput = page.getByPlaceholder('Event title');
  await expect(titleInput).toHaveValue(title);
  await page.getByPlaceholder('https://...').fill(editedUrl);
  await titleInput.fill(editedTitle);
  await page.getByPlaceholder('Description').fill(editedDescription);
  await page.getByPlaceholder('Venue or address').fill(editedLocation);
  await page.getByLabel('Date', { exact: true }).fill(editedDate);
  await page.getByLabel('Time (optional)').fill('18:30');
  await page.getByRole('button', { name: 'Save' }).click();

  // The saved row's detail shows every edited value. The URL renders as a
  // fixed-label link, so the button's appearance proves the URL persisted.
  await expect(visibleText(page, editedTitle)).toBeVisible({
    timeout: 15000,
  });
  await expect(visibleText(page, editedDescription)).toBeVisible();
  await expect(
    visibleText(page, `${expectedDate} · ${expectedTime}`)
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open link' }).filter({ visible: true })
  ).toBeVisible();

  // The location row links out to a Google Maps search for the free text
  // (Location) — route-stubbed so no external request leaves the runner.
  const mapsRow = page
    .getByRole('button', { name: `Open ${editedLocation} in Maps` })
    .filter({ visible: true });
  await expect(mapsRow).toBeVisible();
  await page
    .context()
    .route('**/www.google.com/maps/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' })
    );
  const mapsPopupPromise = page.context().waitForEvent('page');
  await mapsRow.click();
  const mapsPopup = await mapsPopupPromise;
  await mapsPopup.waitForLoadState('domcontentloaded');
  expect(mapsPopup.url()).toContain('https://www.google.com/maps/search/?api=1&query=');
  expect(mapsPopup.url()).toContain(`query=${encodeURIComponent(editedLocation)}`);
  await mapsPopup.close();

  // Back out (past the pre-edit detail the replace left underneath), select
  // the new day on the calendar, and the edited event is listed there.
  // AppHeader's back control is chevron + destination label (Design System
  // Consolidation): accessible name "Back to Events".
  await page
    .getByRole('button', { name: 'Back to Events' })
    .filter({ visible: true })
    .click();
  await page
    .getByRole('button', { name: 'Back to Events' })
    .filter({ visible: true })
    .click();
  await expectCalendar(page);
  await page.getByText(String(newDay), { exact: true }).click();
  await expect(page.getByText(editedTitle, { exact: true })).toBeVisible();

  // Remove cleans up the caller's copy; the title is gone from its day.
  // Re-select the day first in case the replace remounted the calendar on
  // today — absence must be asserted on the day the event was on.
  await openEventFromCalendar(page, editedTitle);
  await removeOpenEvent(page);
  await page.getByText(String(newDay), { exact: true }).click();
  await expect(page.getByText(editedTitle, { exact: true })).not.toBeVisible();
});
