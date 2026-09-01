import { type Dialog } from '@playwright/test';
import { expect, newExtraContext, test } from './fixtures';
import { AUTH_FILE_B } from './constants';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  PERSON_B_NAME,
  addPersonManually,
  archiveOpenEvent,
  createEventAndShareToB,
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
} from './helpers';

const PERSON_A_NAME = 'E2E Account A';

// Hide/unhide (E-105): B hides A from a shared event's detail — after a
// confirm dialog — the event disappears from B's calendar, and unhiding from
// the People Settings sheet brings it back.
//
// The Hide button needs B to have A in My People (sharer attribution resolves
// to the recipient's own person row for the sharer), so the test upserts that
// first. The finally block always unhides: leaving A hidden on the shared
// test account would silently break share.spec's "B sees the event" step in
// later runs.
test('hiding the sharer suppresses their events until unhidden', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const title = uniqueTitle('E2E hide', testInfo.project.name);

  // --- A: share a fresh event to B.
  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await addPersonManually(page, PERSON_B_NAME, ACCOUNT_B.phone);
  await page.getByRole('button', { name: 'Back' }).click();
  await createEventAndShareToB(page, title);

  // --- B (separate context booting from B's stored session from the setup
  // project): make sure A is a known person, then hide A from the event
  // detail.
  const contextB = await newExtraContext(browser, testInfo, AUTH_FILE_B);
  const pageB = await contextB.newPage();
  let hidA = false;
  try {
    await pageB.goto('/');
    await expectCalendar(pageB);
    await pageB.getByRole('button', { name: 'People' }).click();
    await addPersonManually(pageB, PERSON_A_NAME, ACCOUNT_A.phone);
    await pageB.getByRole('button', { name: 'Back' }).click();
    await expectCalendar(pageB);

    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 15000,
    });
    // The Hide button rides on the calendar row's sharer_person_id, which
    // only resolves once B's just-added person row for A is linked and the
    // post-add refetch lands. "From E2E Account A" (B's contact name, not
    // A's display-name fallback) is the visible proof of that join — the
    // standing accounts never race this because their link predates the run.
    // Scope to this run's card: failed runs can leave same-attribution
    // residue on the shared calendar.
    await expect(
      pageB
        .getByRole('button', { name: title })
        .getByText(`From ${PERSON_A_NAME}`, { exact: true })
    ).toBeVisible();
    await openEventFromCalendar(pageB, title);

    // Cancel path: dismissing the confirm changes nothing and stays on the
    // event (Playwright's default dialog dismissal is the Cancel path).
    pageB.once('dialog', (dialog) => dialog.dismiss());
    await pageB.getByRole('button', { name: /^Hide / }).click();
    await expect(
      pageB.getByRole('button', { name: /^Hide / })
    ).toBeVisible();

    // Confirm path: the dialog names the consequence, the silence, and the
    // undo path before anything writes.
    const confirmMessages: string[] = [];
    pageB.once('dialog', (dialog: Dialog) => {
      confirmMessages.push(dialog.message());
      void dialog.accept();
    });
    await pageB.getByRole('button', { name: /^Hide / }).click();
    hidA = true;
    expect(confirmMessages).toHaveLength(1);
    expect(confirmMessages[0]).toContain(`Hide ${PERSON_A_NAME}?`);
    expect(confirmMessages[0]).toContain("won't see events they send you");
    expect(confirmMessages[0]).toContain("aren't told");
    expect(confirmMessages[0]).toContain('unhide them anytime from My People');

    // Hiding navigates back; the calendar refetch drops A's event.
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).not.toBeVisible();

    // Unhide from the People Settings sheet's Hidden section — its permanent
    // home. A still appears in the main People list behind the sheet, so
    // scope strictly to the dialog.
    await pageB.getByRole('button', { name: 'People' }).click();
    await pageB.getByRole('button', { name: 'Settings' }).click();
    const settingsSheet = pageB.getByRole('dialog');
    await expect(
      settingsSheet.getByText('Hidden (1)', { exact: true })
    ).toBeVisible();
    await settingsSheet
      .getByText(PERSON_A_NAME, { exact: true })
      .locator('..')
      .getByRole('button', { name: 'Unhide' })
      .click();
    // The section stays put with a quiet empty state once the last hidden
    // person is unhidden.
    await expect(settingsSheet.getByText('No hidden people')).toBeVisible();
    hidA = false;
    await settingsSheet.getByRole('button', { name: 'Close' }).click();
    // Wait for the sheet to unmount before touching what's underneath.
    await expect(settingsSheet).toBeHidden();
    await pageB.getByRole('button', { name: 'Back' }).click();

    // The event is back on B's calendar.
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 15000,
    });

    // --- Cleanup: B archives their copy (received events have no delete).
    await openEventFromCalendar(pageB, title);
    await archiveOpenEvent(pageB);
  } finally {
    if (hidA) {
      // Best effort: never leave A hidden on the shared account.
      try {
        await pageB.getByRole('button', { name: 'People' }).click();
        await pageB.getByRole('button', { name: 'Settings' }).click();
        await pageB
          .getByRole('dialog')
          .getByText(PERSON_A_NAME, { exact: true })
          .locator('..')
          .getByRole('button', { name: 'Unhide' })
          .click();
      } catch (err) {
        console.error('CLEANUP FAILED: A may still be hidden on account B:', err);
      }
    }
    await contextB.close();
  }

  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});
