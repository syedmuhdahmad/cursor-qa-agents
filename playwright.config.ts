import { defineConfig, devices } from '@playwright/test'

// Set BASE_URL to test an app you start yourself. Without it, Playwright runs `npm run dev`.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './test/e2e',
  // Page objects and test plans live under test/e2e but are not specs.
  testIgnore: ['**/pages/**', '**/plan/**'],
  fullyParallel: true,
  // On CI, fail on a stray test.only and retry flaky tests.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    // Record a trace only when a test is retried, to keep runs fast.
    trace: 'on-first-retry',
  },
  // Start the app unless BASE_URL points at one that is already running.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
