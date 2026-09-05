import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from './fixtures';

// A2P 10DLC: the campaign's privacy-policy evidence is this static page
// at the production URL (docs/a2p-registration.md). The 2026-09-05
// rejection was TCR 30908 — reviewers could not verify a compliant policy.
// If this copy regresses, the campaign re-rejects.
//
// Local `serve -s dist` SPA-falls `/privacy` back to the app (cleanUrls
// 301s `/privacy.html` → `/privacy`, then the catch-all). Cloudflare Pages
// pretty-URLs serve the real file first, so a deployed E2E_BASE_URL can
// hit `/privacy` / `/terms` the way the reviewer does.

const TCR_NON_SHARING_CLAUSE =
  'No mobile information will be shared with third parties/affiliates for marketing/promotional purposes.';

function legalPageUrl(name: 'privacy' | 'terms'): string {
  const base = process.env.E2E_BASE_URL?.replace(/\/$/, '');
  if (base) return `${base}/${name}`;
  return pathToFileURL(resolve('public', `${name}.html`)).href;
}

test('privacy policy is the A2P evidence page (TCR non-sharing clause)', async ({
  page,
}) => {
  const response = await page.goto(legalPageUrl('privacy'));
  expect(response?.ok() ?? true).toBeTruthy();

  await expect(page).toHaveTitle(/Shared Events — Privacy Policy/);
  await expect(
    page.getByRole('heading', { name: 'Shared Events — Privacy Policy' })
  ).toBeVisible();
  await expect(page.getByText('Operated by Ramsey Kilani.')).toBeVisible();
  await expect(page.getByText(TCR_NON_SHARING_CLAUSE)).toBeVisible();
  await expect(
    page.getByText(
      /Affiliate tagging does not share your mobile number or messaging consent/
    )
  ).toBeVisible();
});

test('terms name the registered brand', async ({ page }) => {
  const response = await page.goto(legalPageUrl('terms'));
  expect(response?.ok() ?? true).toBeTruthy();

  await expect(page).toHaveTitle(/Shared Events — Terms of Service/);
  await expect(
    page.getByRole('heading', { name: 'Shared Events — Terms of Service' })
  ).toBeVisible();
  await expect(page.getByText('Operated by Ramsey Kilani.')).toBeVisible();
});
