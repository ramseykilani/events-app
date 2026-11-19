import { test, expect } from './fixtures';

// The desktop app is the installable PWA: manifest, icons and service worker
// are served with the build.
test('the web build is an installable PWA', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('I Love You');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'I Love You', display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain("addEventListener('fetch'");
});
