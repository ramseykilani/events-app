import {
  test as base,
  type Browser,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test';

// Drops `navigator.locks` before any app code runs, which makes supabase-js
// fall back to its no-op auth lock (GoTrueClient only uses
// NavigatorLockManager when `navigator.locks` exists).
//
// Why: Web Locks are browser-process-wide per origin, and Playwright reuses
// one browser process across tests and across contexts. A document that is
// destroyed while its supabase client holds (or is acquiring) the
// `sb-<ref>-auth-token` lock — e.g. a reload or context close racing an
// in-flight auth call — orphans the lock, and every later document in that
// browser hangs inside `supabase.auth.getSession()`: the app sits on its boot
// spinner until the acquire timeout rejects. E2e contexts are single-tab per
// account, so cross-tab lock coordination has nothing to protect here.
//
// Must be self-contained: Playwright serializes this function into the page.
export function disableNavigatorLocks(): void {
  Object.defineProperty(window.navigator, 'locks', {
    value: undefined,
    configurable: true,
  });
}

// Counts browser notification-permission requests on
// window.__e2eNotificationRequests. Project rule: web users get SMS and are
// never prompted — a regression here means a confusing browser popup on
// sign-in (observed in the wild).
export function instrumentNotificationRequests(): void {
  const w = window as unknown as {
    __e2eNotificationRequests: number;
    Notification?: { requestPermission?: unknown };
  };
  w.__e2eNotificationRequests = 0;
  const requestPermission = w.Notification?.requestPermission;
  if (typeof requestPermission === 'function' && w.Notification) {
    w.Notification.requestPermission = (...args: unknown[]) => {
      w.__e2eNotificationRequests += 1;
      return (requestPermission as (...a: unknown[]) => unknown).apply(
        w.Notification,
        args
      );
    };
  }
}

// Shared fixtures for all e2e specs. Any context created outside the fixture
// (e.g. the second account in share.spec.ts) must register the same script —
// use newExtraContext() below.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(disableNavigatorLocks);
    await context.addInitScript(instrumentNotificationRequests);
    await use(context);
  },
});

// A second context inside a test (signed-out flows, a second account). Gets
// the project baseURL and the Web-Locks shim. The empty storageState matters:
// the test runner applies project `use` options — including the signed-in
// storageState — to manual browser.newContext() calls, so without this the
// "signed-out" context would boot straight into account A's calendar.
export async function newExtraContext(
  browser: Browser,
  testInfo: TestInfo
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: { cookies: [], origins: [] },
  });
  await context.addInitScript(disableNavigatorLocks);
  await context.addInitScript(instrumentNotificationRequests);
  return context;
}

export { expect } from '@playwright/test';
