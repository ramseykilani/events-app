import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE_A } from './e2e/constants';

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
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx serve -s dist -l ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
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
