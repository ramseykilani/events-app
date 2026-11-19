import { test as base, type Browser, type BrowserContext, type TestInfo } from '@playwright/test';

// Same Web Locks shim as apps/events/e2e/fixtures.ts: supabase-js's
// navigator.locks are browser-process-wide per origin, and a document
// destroyed mid-lock orphans one and hangs every later getSession(). Test
// contexts drop navigator.locks so supabase-js uses its no-op lock.
export function disableNavigatorLocks(): void {
  Object.defineProperty(window.navigator, 'locks', { value: undefined, configurable: true });
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(disableNavigatorLocks);
    await use(context);
  },
});

// A second context in a test (the partner, or a signed-out person). Pass a
// storage-state file to boot into that account's session.
export async function newExtraContext(
  browser: Browser,
  testInfo: TestInfo,
  storageState?: string,
  viewport?: { width: number; height: number }
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: storageState ?? { cookies: [], origins: [] },
    serviceWorkers: 'block',
    permissions: ['microphone', 'camera'],
    ...(viewport ? { viewport } : {}),
  });
  await context.addInitScript(disableNavigatorLocks);
  return context;
}

export { expect } from '@playwright/test';
