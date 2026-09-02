import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { AUTH_FILE_A } from './e2e/constants';

// Playwright runs in plain Node and does not read .env — load it (without
// overriding real env vars) so local runs pick up EXPO_PUBLIC_* and
// E2E_ACCOUNT_PASSWORD without shell exports.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// E2E coverage for the web build. Runs the same specs on desktop Chrome and
// on mobile emulation (Mobile Safari/WebKit + Mobile Chrome) so mobile-web
// regressions are caught before release, not just desktop ones.
//
// By default tests run against a local static serve of dist/ (run
// `npm run build:web` first). Set E2E_BASE_URL to run against a deployed
// build instead, e.g. the staging preview:
//   E2E_BASE_URL=https://staging.shared-events.pages.dev npm run test:e2e
const PORT = Number(process.env.E2E_PORT ?? 8081);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
// The Who's Coming receipt page (receipt/) is a separate static site with no
// build step; e2e/receipt.spec.ts serves it locally and route-mocks its API,
// so it never touches the live deployment. Override with E2E_RECEIPT_URL to
// run that spec against the deployed page instead.
const RECEIPT_PORT = Number(process.env.E2E_RECEIPT_PORT ?? 8082);
const receiptURL = process.env.E2E_RECEIPT_URL ?? `http://localhost:${RECEIPT_PORT}`;
// The beta landing page (landing/) is likewise a standalone static site;
// e2e/landing.spec.ts serves it locally the same way. E2E_LANDING_URL
// overrides for running that spec against a deployed preview.
const LANDING_PORT = Number(process.env.E2E_LANDING_PORT ?? 8083);
const landingURL = process.env.E2E_LANDING_URL ?? `http://localhost:${LANDING_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // One worker: every project shares the same two Supabase test accounts, so
  // parallel workers would race each other's calendars and OTP requests.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : [['list'], ['html']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    ...(process.env.E2E_BASE_URL
      ? []
      : [
          {
            command: `npx serve -s dist -l ${PORT}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
        ]),
    ...(process.env.E2E_RECEIPT_URL
      ? []
      : [
          {
            command: `npx serve -s receipt -l ${RECEIPT_PORT}`,
            url: receiptURL,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
        ]),
    ...(process.env.E2E_LANDING_URL
      ? []
      : [
          {
            command: `npx serve -s landing -l ${LANDING_PORT}`,
            url: landingURL,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
        ]),
  ],
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE_A },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'], storageState: AUTH_FILE_A },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], storageState: AUTH_FILE_A },
      dependencies: ['setup'],
    },
  ],
});
