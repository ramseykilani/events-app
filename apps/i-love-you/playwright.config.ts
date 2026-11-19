import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE_A } from './e2e/constants';

// E2E for the web build against the real local backend (e2e/stack.sh: the
// Supabase CLI stack + a LiveKit dev server). `npm run test:e2e` brings the
// stack up, resets the database and builds the bundle against it, then runs
// these specs on desktop Chrome (two-pane layout, shortcuts) and a phone
// viewport (single column).
//
// Chromium gets a fake camera and microphone so the call specs exercise real
// WebRTC through LiveKit. PW_CHROMIUM_PATH points at a preinstalled browser
// when the pinned @playwright/test's own download is absent (cloud VMs).
const PORT = Number(process.env.E2E_PORT ?? 8093);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const launchOptions = {
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
};

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // One worker: specs share the paired test couple, and pairing/sign-in
  // specs mint their own fresh numbers in order.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    permissions: ['microphone', 'camera'],
    launchOptions,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx serve -s .e2e/dist -l ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  projects: [
    { name: 'setup', testMatch: /pair\.setup\.ts/, use: { ...devices['Desktop Chrome'], launchOptions } },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, storageState: AUTH_FILE_A, launchOptions },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], storageState: AUTH_FILE_A, launchOptions },
      dependencies: ['setup'],
      // The desktop-only specs (two panes, keyboard) skip themselves here.
    },
  ],
});
