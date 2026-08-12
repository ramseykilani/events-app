import { expect, test } from './fixtures';
import {
  expectCalendar,
  openEventFromCalendar,
  removeOpenEvent,
  uniqueTitle,
} from './helpers';

// Display names: the share screen gates the Share action on a saved name
// (the SMS recipients get is attributed "X added you to ..."), and the People
// footer offers the edit path. The gate only appears while the account has
// no name — once any run saves one it sticks server-side, so the gated half
// of this test is exercised on the first run and skipped (by design) after.
test('share is gated on a display name, which the People footer edits', async ({
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

  // --- Edit path: the People footer row shows the name and opens the editor.
  await page.getByRole('button', { name: 'People' }).click();
  const nameRow = page.getByRole('button', { name: /Your name:/ });
  await expect(nameRow).toBeVisible();
  await nameRow.click();

  // The editor is a modal (role=dialog) over the People screen — scope to it.
  const nameDialog = page.getByRole('dialog');
  await expect(nameDialog.getByLabel('Your name')).toBeVisible();
  await nameDialog.getByLabel('Your name').fill(NAME);
  await nameDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(nameDialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: `Your name: ${NAME}` })
  ).toBeVisible();

  // --- Cleanup: remove the event created above.
  await page.getByRole('button', { name: 'Back' }).click();
  await expectCalendar(page);
  await openEventFromCalendar(page, title);
  await removeOpenEvent(page);
});
