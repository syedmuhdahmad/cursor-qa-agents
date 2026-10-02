import { expect, test } from '@playwright/test'

// Smoke test: the app's home page loads. The Playwright planner and generator
// skills name this file as the seed spec.
test('seed', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
})
