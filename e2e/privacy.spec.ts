import { expect, test } from './fixtures';

// A2P 10DLC: the campaign's privacy-policy evidence is this static page
// at the production URL (docs/a2p-registration.md). The 2026-09-05
// rejection was TCR 30908 — reviewers could not verify a compliant policy.
// If this copy regresses, the campaign re-rejects.

const TCR_NON_SHARING_CLAUSE =
  'No mobile information will be shared with third parties/affiliates for marketing/promotional purposes.';

test('privacy policy is the A2P evidence page (TCR non-sharing clause)', async ({
  page,
}) => {
  // Extensionless path is what the campaign message_flow and Cloudflare
  // pretty-URLs expose (`/privacy.html` 308s to `/privacy` in production).
  const response = await page.goto('/privacy');
  expect(response?.ok()).toBeTruthy();

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
  const response = await page.goto('/terms');
  expect(response?.ok()).toBeTruthy();

  await expect(page).toHaveTitle(/Shared Events — Terms of Service/);
  await expect(
    page.getByRole('heading', { name: 'Shared Events — Terms of Service' })
  ).toBeVisible();
  await expect(page.getByText('Operated by Ramsey Kilani.')).toBeVisible();
});
