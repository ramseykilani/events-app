import { expect, test } from './fixtures';
import { expectCalendar } from './helpers';

// Theme swatch cycles the registry (Paper -> Evening -> Paper) and the choice
// persists across reloads. Themes are named moods — the OS color scheme must
// never matter, so this runs under the default (light) emulation on every
// project.
test('theme swatch cycles themes and persists across reload', async ({
  page,
}) => {
  await page.goto('/');
  await expectCalendar(page);

  const toEvening = page.getByRole('button', { name: 'Switch to Evening theme' });
  await expect(toEvening).toBeVisible();
  await toEvening.click();

  const toPaper = page.getByRole('button', { name: 'Switch to Paper theme' });
  await expect(toPaper).toBeVisible();

  // The choice is persisted to storage — a reload keeps Evening.
  await page.reload();
  await expectCalendar(page);
  await expect(toPaper).toBeVisible();

  // Back to Paper so the shared account doesn't leak a dark theme into other
  // runs' screenshots.
  await toPaper.click();
  await expect(
    page.getByRole('button', { name: 'Switch to Evening theme' })
  ).toBeVisible();
});
