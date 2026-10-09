import { existsSync } from 'node:fs'
import { chromium, defineConfig, devices } from '@playwright/test'

// Set BASE_URL to test an app you start yourself. Without it, Playwright runs `npm run dev`.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

// Playwright's own Chromium can be missing where this shell looks for it.
// Cursor's agent sandbox, for one, points the browser cache at a folder of its
// own. Google Chrome is used then, which playwright-cli needs in any case.
const ownChromium = existsSync(chromium.executablePath())

export default defineConfig({
  testDir: './test/e2e',
  // Page objects and test plans live under test/e2e but are not specs.
  testIgnore: ['**/pages/**', '**/plan/**'],
  fullyParallel: true,
  // A stray test.only fails the run. Without this, only that test runs and the run still passes.
  forbidOnly: true,
  // On CI, retry a failed test. A test that passes only on a retry is reported as flaky.
  retries: process.env.CI ? 2 : 0,
  // The list reporter, then one last line that starts with `QA-VERDICT:`.
  // A --reporter flag on the command line replaces both.
  reporter: [['list'], ['./.cursor/qa/playwright-verdict.mjs']],
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
      use: { ...devices['Desktop Chrome'], ...(ownChromium ? {} : { channel: 'chrome' }) },
    },
  ],
})
