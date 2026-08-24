import { expect, newExtraContext, test } from './fixtures';
import { AUTH_FILE_B } from './constants';
import {
  ACCOUNT_B,
  PERSON_B_NAME,
  addPersonManually,
  createEventAndShareToB,
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
  visibleText,
} from './helpers';

// Copy + Follow end to end: a share delivers the recipient their own row
// which FOLLOWS the sender's row — the sender's later edits cascade to it
// silently — until the recipient saves their own edit, which ends following
// (owner decision 2026-08-21: any field-changing save freezes the copy).
//
// A shares to B → A edits the time → B's row shows the new time on next
// focus → B edits the title → A's second edit no longer reaches B.
test('edits cascade to followers until the follower edits locally', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const title = uniqueTitle('E2E cascade', testInfo.project.name);
  const bTitle = `${title} (B's edition)`;
  const timeStr = (t: string) =>
    new Date(`1970-01-01T${t}:00`).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

  // --- A: make sure B is in My People, then create + share the event.
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();
  await createEventAndShareToB(page, title);

  // --- A edits the time; the share has already delivered B's copy.
  await openEventFromCalendar(page, title);
  await page.getByRole('button', { name: 'Edit' }).filter({ visible: true }).click();
  await page.getByLabel('Time (optional)').fill('18:30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    visibleText(page, timeStr('18:30'))
  ).toBeVisible({ timeout: 15000 });

  const contextB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const pageB = await contextB.newPage();
  try {
    // --- B's copy follows A: it shows A's edited time on first load.
    await pageB.goto('/');
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await openEventFromCalendar(pageB, title);
    await expect(visibleText(pageB, timeStr('18:30'))).toBeVisible({
      timeout: 15000,
    });

    // --- B edits the title: B's row freezes (stops following A).
    await pageB.getByRole('button', { name: 'Edit' }).filter({ visible: true }).click();
    await pageB.getByPlaceholder('Event title').fill(bTitle);
    await pageB.getByRole('button', { name: 'Save' }).click();
    await expect(visibleText(pageB, bTitle)).toBeVisible({ timeout: 15000 });

    // --- A edits again (time + description); a frozen follower is skipped.
    await page.getByRole('button', { name: 'Edit' }).filter({ visible: true }).click();
    await page.getByLabel('Time (optional)').fill('19:45');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(visibleText(page, timeStr('19:45'))).toBeVisible({
      timeout: 15000,
    });

    // --- B keeps their own version: A's second edit does not reach B.
    // (The reload also resets B's nav stack to the calendar, so the cleanup
    // removal below pops straight back to it.)
    await pageB.reload();
    await expectCalendar(pageB);
    await openEventFromCalendar(pageB, bTitle);
    await expect(visibleText(pageB, timeStr('18:30'))).toBeVisible({
      timeout: 15000,
    });
    await expect(visibleText(pageB, timeStr('19:45'))).toBeHidden();

    // --- And B's edit never travels upstream: A's row keeps A's title.
    await expect(visibleText(page, title)).toBeVisible();

    // --- Cleanup: both sides remove their rows.
    await removeOpenEvent(pageB);
  } finally {
    await contextB.close();
  }

  // A's stack carries pre-edit detail screens (edit saves router.replace
  // onto them) — reset to the calendar before removing.
  await page.goto('/');
  await expectCalendar(page);
  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});

// Notification-tap resolution (Copy + Follow id scoping): row ids are
// owner-scoped, so a payload carrying the SENDER's row id must resolve to
// the recipient's own copy via the from_event_id fallback — never "Event
// not found". (Push itself has no web surface; the tap target is URL-
// testable.)
test('navigating to the sender\'s row id lands on the recipient\'s own copy', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const title = uniqueTitle('E2E tap', testInfo.project.name);

  // --- A: create + share, then open the detail to learn the sender row id.
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();
  await createEventAndShareToB(page, title);
  await openEventFromCalendar(page, title);
  const senderRowId = new URL(page.url()).pathname.split('/event/')[1];
  expect(senderRowId).toBeTruthy();

  const contextB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const pageB = await contextB.newPage();
  try {
    // --- B opens the sender's row id directly (the notification-tap path).
    await pageB.goto(`/event/${senderRowId}`);
    await expect(
      pageB.getByRole('button', { name: 'Remove Event' }).filter({ visible: true })
    ).toBeVisible({ timeout: 30000 });
    await expect(visibleText(pageB, title)).toBeVisible();
    await expect(pageB.getByText('Event not found')).toBeHidden();
    await expect(pageB.getByText('Access removed')).toBeHidden();

    // --- Cleanup: B removes their copy (via the calendar, so the removal
    // pops straight back to it).
    await pageB.goto('/');
    await expectCalendar(pageB);
    await openEventFromCalendar(pageB, title);
    await removeOpenEvent(pageB);
  } finally {
    await contextB.close();
  }

  await removeOpenEvent(page);
});
