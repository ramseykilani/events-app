import { expect, test } from './fixtures';
import {
  addPersonManually,
  expectCalendar,
  uniqueTitle,
} from './helpers';

// People management (E-101): manual add normalizes to E.164 and shows the
// person, the count updates, circles are created/edited/deleted, and removing
// a person asks for confirmation. Uses unique names per run and cleans up, so
// repeated runs don't accumulate fixtures in the shared test account.
test('add person, manage a circle, then remove both', async ({
  page,
}, testInfo) => {
  const personName = uniqueTitle('E2E Person', testInfo.project.name);
  const circleName = uniqueTitle('E2E Circle', testInfo.project.name);
  // Reserved fictional 555 range — never a real subscriber.
  const personPhone = '+15555550199';

  await page.goto('/');
  await expectCalendar(page);
  await page.getByRole('button', { name: 'People' }).click();
  await expect(page.getByText('My People')).toBeVisible();

  try {
    // --- Add a person manually (web has no contacts API).
    await addPersonManually(page, personName, personPhone);

    // --- Create a circle. Type character-by-character and verify the value:
    // the Add button stays disabled until the state update lands, and a bare
    // fill() raced a re-render here once and hung the click.
    const circleInput = page.getByPlaceholder('New circle name');
    await circleInput.click();
    await circleInput.pressSequentially(circleName);
    await expect(circleInput).toHaveValue(circleName);
    await page
      .getByRole('button', { name: 'Add', exact: true })
      .last()
      .click();
    // The circle row: name and meta sit in circleInfo, actions in a sibling —
    // the row is two levels up from the name text.
    const circleRow = page
      .getByText(circleName, { exact: true })
      .locator('../..');
    await expect(circleRow.getByText('0 members')).toBeVisible();

    // --- Add the person to the circle. The members editor is a modal
    // (role=dialog) rendered ON TOP of the People screen — the list behind it
    // stays in the DOM and visible, so everything inside the modal must be
    // scoped to the dialog or strict mode sees double.
    const membersDialog = page.getByRole('dialog');
    await circleRow.getByRole('button', { name: 'Edit' }).click();
    // Same retry-guarded selection as the share sheet: the tap can be eaten
    // by a re-render, so retry until the row's ✓ shows.
    const memberRow = membersDialog
      .getByText(personName, { exact: true })
      .locator('..');
    await expect(async () => {
      if (!(await memberRow.getByText('✓').isVisible().catch(() => false))) {
        await memberRow.click();
      }
      await expect(memberRow.getByText('✓')).toBeVisible({ timeout: 2000 });
    }).toPass();
    await membersDialog.getByRole('button', { name: 'Save', exact: true }).click();
    // As with the add-person modal, wait for the slide-out to fully unmount
    // before touching the screen underneath.
    await expect(membersDialog).toBeHidden();
    await expect(circleRow.getByText('1 members')).toBeVisible();

    // --- Delete the circle (confirms via window.confirm on web).
    page.once('dialog', (dialog) => dialog.accept());
    await circleRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(circleName, { exact: true })).not.toBeVisible();
  } finally {
    // --- Remove the person (idempotent cleanup, also asserts the confirm flow).
    const personRow = page.getByText(personName, { exact: true });
    if (await personRow.count()) {
      page.once('dialog', (dialog) => dialog.accept());
      await personRow
        .locator('..')
        .getByRole('button', { name: 'Remove' })
        .click();
      await expect(personRow).not.toBeVisible();
    }
  }
});
