import { expect, newExtraContext, test } from './fixtures';
import { AUTH_FILE_B } from './constants';
import {
  ACCOUNT_A,
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

const PERSON_A_NAME = 'E2E Account A';

// Archive Received Events end to end: B's received copy shows Archive (never
// Remove Event — on the detail screen or the edit form, KI-015); archiving
// needs no confirm and is reversible through the
// Archived drawer; the conditional say-No prompt rides the archive moment —
// "Not now" archives silently, "Tell X no" records No and pings the asker;
// a deep link to an archived row opens its detail with Restore.
//
// Residue note: received events have no delete path, so B's drawer
// accumulates archived rows across runs on this shared account. The footer
// link assertions are therefore baseline-relative (the link may already be
// present from earlier runs); the drawer's per-title listing is the strong
// check. A removes their own copy at the end; B's copy stays archived.
test('received events archive and restore; the say-No prompt rides the archive', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const title = uniqueTitle('E2E archive', testInfo.project.name);

  // --- Account A: make sure B is in My People, create + share today's event.
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();
  await createEventAndShareToB(page, title);

  const contextB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const pageB = await contextB.newPage();
  // The say-No prompt is a window.confirm on web. Record every prompt;
  // dismiss ("Not now") unless the test is on the accept ("Tell X no") leg.
  let acceptPrompt = false;
  const promptMessages: string[] = [];
  pageB.on('dialog', (dialog) => {
    promptMessages.push(dialog.message());
    void (acceptPrompt ? dialog.accept() : dialog.dismiss());
  });
  // The asker push fires only when the answer CHANGES. POST only — the
  // cross-origin invoke's CORS preflight OPTIONS must not count.
  let notifyCalls = 0;
  pageB.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('send-response-notification')) {
      notifyCalls += 1;
    }
  });
  try {
    // --- B: A is a known person (deterministic attribution), event on today.
    await pageB.goto('/');
    await expectCalendar(pageB);
    await pageB.getByRole('button', { name: 'People' }).click();
    await addPersonManually(pageB, PERSON_A_NAME, ACCOUNT_A.phone);
    await pageB.getByRole('button', { name: 'Back' }).click();
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 30000,
    });

    // Baseline: earlier runs may have left archived rows on this shared
    // account, so the footer link may already be present. The title being
    // visible means the fetch (and its archive probe) has landed.
    const archivedLink = () =>
      pageB
        .getByRole('button', { name: 'Archived events' })
        .filter({ visible: true });
    const linkAtBaseline = await archivedLink().isVisible().catch(() => false);

    // --- Received detail: Archive, never Remove Event. Capture B's row id
    // for the deep-link step. The reply widget must be loaded before
    // archiving — the say-No prompt reads the loaded answer state.
    await openEventFromCalendar(pageB, title);
    await expect(
      pageB.getByRole('button', { name: 'Remove Event' }).filter({ visible: true })
    ).toHaveCount(0);
    await expect(
      pageB.getByText(/are you in\?/).filter({ visible: true })
    ).toBeVisible({ timeout: 15000 });
    const bRowId = new URL(pageB.url()).pathname.split('/event/')[1];
    expect(bRowId).toBeTruthy();

    // --- KI-015: the edit form offers no Remove Event on a received row
    // either — Archive (here on the detail screen) is the only removal path.
    // Editing itself stays available. Cancel returns to the still-mounted
    // detail screen with the reply widget already loaded.
    await pageB.getByRole('button', { name: 'Edit' }).filter({ visible: true }).click();
    await expect(pageB.getByPlaceholder('Event title')).toHaveValue(title);
    await expect(
      pageB.getByRole('button', { name: 'Remove Event' }).filter({ visible: true })
    ).toHaveCount(0);
    await pageB.getByRole('button', { name: 'Cancel' }).filter({ visible: true }).click();
    await expect(
      pageB.getByRole('button', { name: 'Archive' }).filter({ visible: true })
    ).toBeVisible({ timeout: 15000 });

    // --- Archive with "Not now": the prompt fires once, no answer is
    // written, and the event leaves the calendar.
    await pageB.getByRole('button', { name: 'Archive' }).filter({ visible: true }).click();
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).not.toBeVisible();
    expect(promptMessages.length).toBe(1);
    expect(promptMessages[0]).toContain(`Let ${PERSON_A_NAME} know you're not in?`);
    expect(notifyCalls).toBe(0);

    // --- The footer link is present and opens the drawer; the row lists
    // with attribution.
    await expect(archivedLink()).toBeVisible();
    await archivedLink().click();
    // Scope to THIS event's card: the shared account's drawer carries
    // residue rows from earlier runs with the same attribution.
    const drawerCard = pageB
      .getByRole('button', { name: title, exact: true })
      .filter({ visible: true });
    await expect(drawerCard).toBeVisible({ timeout: 15000 });
    await expect(
      drawerCard.getByText(`From ${PERSON_A_NAME}`, { exact: true })
    ).toBeVisible();

    // --- Restore returns the event to its date and drops it from the
    // drawer; the footer link returns to its baseline state.
    await pageB
      .getByRole('button', { name: `Restore ${title}` })
      .filter({ visible: true })
      .click();
    await expect(visibleText(pageB, title)).not.toBeVisible();
    await pageB.getByRole('button', { name: 'Back' }).filter({ visible: true }).click();
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({ timeout: 15000 });
    if (linkAtBaseline) {
      await expect(archivedLink()).toBeVisible();
    } else {
      await expect(archivedLink()).not.toBeVisible();
    }

    // --- Archive again, this time "Tell X no": the answer lands on A's
    // "Shared with" and the asker gets exactly one push invoke.
    await openEventFromCalendar(pageB, title);
    await expect(
      pageB.getByText(/are you in\?/).filter({ visible: true })
    ).toBeVisible({ timeout: 15000 });
    acceptPrompt = true;
    await pageB.getByRole('button', { name: 'Archive' }).filter({ visible: true }).click();
    await expectCalendar(pageB);
    expect(promptMessages.length).toBe(2);
    expect(promptMessages[1]).toContain(`Let ${PERSON_A_NAME} know you're not in?`);
    await expect.poll(() => notifyCalls, { timeout: 15000 }).toBe(1);

    // --- A reloads (pull model): "Shared with" shows B's No.
    await page.reload();
    await openEventFromCalendar(page, title);
    await expect(visibleText(page, 'Shared with')).toBeVisible();
    await expect(visibleText(page, PERSON_B_NAME)).toBeVisible();
    await expect(visibleText(page, 'No')).toBeVisible({ timeout: 15000 });

    // --- Deep link to the archived row opens its detail with Restore.
    await pageB.goto(`/event/${bRowId}`);
    await expect(
      pageB.getByRole('button', { name: 'Restore' }).filter({ visible: true })
    ).toBeVisible({ timeout: 30000 });
    await expect(visibleText(pageB, title)).toBeVisible();

    // --- Cleanup: A removes their own row. B's copy stays archived — there
    // is no delete path for received events (benign drawer residue).
    await removeOpenEvent(page);
  } finally {
    await contextB.close();
  }
});
