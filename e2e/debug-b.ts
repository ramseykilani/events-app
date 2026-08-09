import { chromium, devices } from 'playwright';

(async () => {
  const browser = await chromium.launch();

  // Context A: like the fixture provides (locks disabled, stored session).
  const contextA = await browser.newContext({
    ...devices['Desktop Chrome'],
    storageState: 'e2e/.auth/user-a.json',
    baseURL: 'http://localhost:8081',
  });
  await contextA.addInitScript(() => {
    Object.defineProperty(window.navigator, 'locks', { value: undefined, configurable: true });
  });
  const pageA = await contextA.newPage();
  await pageA.goto('/');
  await pageA.waitForTimeout(4000);
  console.log('A bodyLen:', await pageA.evaluate(() => document.body.innerText.length));

  // Context B: exactly what share.spec.ts does today (no init script).
  const contextB = await browser.newContext({ baseURL: 'http://localhost:8081' });
  const pageB = await contextB.newPage();
  pageB.on('console', (m) => console.log('B console', m.type(), m.text().slice(0, 200)));
  pageB.on('pageerror', (e) => console.log('B pageerror', e.message.slice(0, 300)));
  await pageB.goto('/');
  await pageB.waitForTimeout(3000);

  const locks = await pageB.evaluate(async () => {
    if (!('locks' in navigator) || !navigator.locks) return 'no locks API';
    const s = await navigator.locks.query();
    return JSON.stringify({ held: s.held, pending: s.pending });
  });
  console.log('B locks state:', locks);

  for (let i = 0; i < 4; i++) {
    const bodyLen = await pageB.evaluate(() => document.body.innerText.length);
    console.log(`B t=${(i + 1) * 3}s bodyLen=${bodyLen}`);
    if (bodyLen > 20) break;
    await pageB.waitForTimeout(3000);
  }

  await browser.close();
})();
