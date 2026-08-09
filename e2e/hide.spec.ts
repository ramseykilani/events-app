import { expect, newExtraContext, test } from './fixtures';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  PERSON_B_NAME,
  addPersonManually,
  createEventAndShareToB,
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  signIn,
  uniqueTitle,
} from './helpers';

const PERSON_A_NAME = 'E2E Account A';

// Hide/unhide (E-105): B hides A from a shared event's detail, the event
// disappears from B's calendar, and unhiding from People brings it back.
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

  // --- B: make sure A is a known person, then hide A from the event detail.
  const contextB = await newExtraContext(browser, testInfo);
  const pageB = await contextB.newPage();
  let hidA = false;
  try {
    await signIn(pageB, ACCOUNT_B);
    await pageB.getByRole('button', { name: 'People' }).click();
    await addPersonManually(pageB, PERSON_A_NAME, ACCOUNT_A.phone);
    await pageB.getByRole('button', { name: 'Back' }).click();
    await expectCalendar(pageB);

    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await openEventFromCalendar(pageB, title);
    await pageB.getByRole('button', { name: /^Hide / }).click();
    hidA = true;

    // Hiding navigates back; the calendar refetch drops A's event.
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).not.toBeVisible();

    // Unhide from the People screen's Hidden section. Hidden people still
    // appear in the main People list too, so scope strictly to the section.
    await pageB.getByRole('button', { name: 'People' }).click();
    const hiddenSection = pageB
      .getByText('Hidden', { exact: true })
      .locator('..');
    await expect(
      hiddenSection.getByText(PERSON_A_NAME, { exact: true })
    ).toBeVisible();
    await hiddenSection
      .getByText(PERSON_A_NAME, { exact: true })
      .locator('..')
      .getByRole('button', { name: 'Unhide' })
      .click();
    await expect(
      hiddenSection.getByText(PERSON_A_NAME, { exact: true })
    ).not.toBeVisible();
    hidA = false;
    await pageB.getByRole('button', { name: 'Back' }).click();

    // The event is back on B's calendar.
    await expectCalendar(pageB);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 15000,
    });

    // --- Cleanup: both sides remove their copies.
    await openEventFromCalendar(pageB, title);
    await removeOpenEvent(pageB);
  } finally {
    if (hidA) {
      // Best effort: never leave A hidden on the shared account.
      try {
        await pageB.getByRole('button', { name: 'People' }).click();
        await pageB
          .getByText('Hidden', { exact: true })
          .locator('..')
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
