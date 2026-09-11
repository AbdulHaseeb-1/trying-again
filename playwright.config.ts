import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * Two servers, both real: the compiled NestJS service (with a stand-in model)
 * and the exported Expo web build. The tests drive the same JavaScript that
 * ships to a phone — React Native Web renders the identical components — so a
 * layout or streaming bug found here is a bug in the product, not in a mock.
 *
 * Run `npm run build:e2e` first, or let `webServer` do it.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 4021);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4022);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // The two suites share one server and one conversation store, so running
  // them in parallel would have them reading each other's history.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      /**
       * Some environments ship a Chromium that Playwright did not download
       * itself (a container image, a distro package). Point at it with
       * `E2E_CHROMIUM_PATH` rather than re-downloading one.
       */
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    },
  },

  projects: [
    {
      name: 'desktop',
      // The phone suite has its own project; running it at desktop width would
      // assert sheet behaviour against the docked panel.
      testIgnore: '**/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // A phone-sized viewport, where the panel is a sheet rather than a dock.
      name: 'mobile',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: [
    {
      command: 'node --import tsx e2e/api-server.mjs',
      cwd: 'server',
      url: `http://127.0.0.1:${API_PORT}/api/news/status`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node e2e/static-server.mjs',
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
