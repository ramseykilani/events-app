import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
} from './helpers';

// Display names: the share screen gates the Share action on a saved name
// (the SMS recipients get is attributed "X wants to go to ... with you"),
// and the People Settings sheet offers the edit path. The gate only appears
// while the account has
// no name — once any run saves one it sticks server-side, so the gated half
// of this test is exercised on the first run and skipped (by design) after.
test('share is gated on a display name, which the People Settings sheet edits', async ({
  page,
}, testInfo) => {
  const title = uniqueTitle('E2E name', testInfo.project.name);
  const NAME = 'E2E User A';

  await page.goto('/');
  await expectCalendar(page);

  // --- Create an event; the share screen follows automatically.
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByPlaceholder('Event title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Share with')).toBeVisible();

  // --- Gate: shown only while the account has no display name. When shown,
  // Share is blocked until the name is saved.
  const nameInput = page.getByLabel('Your name');
  try {
    await nameInput.waitFor({ state: 'visible', timeout: 8000 });
    await expect(
      page.getByRole('button', { name: 'Share', exact: true })
    ).toBeDisabled();
    await nameInput.fill(NAME);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(nameInput).toBeHidden();
  } catch {
    // Account already named by an earlier run — the gate must stay gone.
    await expect(nameInput).toBeHidden();
  }

  // --- Cancel out (no share needed) and clean up the event.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expectCalendar(page);

  // --- Edit path: the Settings sheet's name row shows the name and opens
  // the editor (the sheet closes first — no stacked modals).
  await page.getByRole('button', { name: 'People' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog');
  const nameRow = sheet.getByRole('button', { name: /Your name:/ });
  await expect(nameRow).toBeVisible();
  await nameRow.click();

  // The editor opens as the sheet closes (no stacked modals). Exact match:
  // the sheet's name row carries aria-label "Your name: <name>", which a
  // substring getByLabel would also hit while the swap is in flight.
  const nameDialog = page.getByRole('dialog');
  const editorInput = nameDialog.getByLabel('Your name', { exact: true });
  await expect(editorInput).toBeVisible();
  await editorInput.fill(NAME);
  await nameDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(nameDialog).toBeHidden();

  // The sheet row reflects the new name on the next open.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: `Your name: ${NAME}` })
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // --- Cleanup: remove the event created above.
  await page.getByRole('button', { name: 'Back' }).click();
  await expectCalendar(page);
  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});
