import { expect, test } from '@playwright/test'

test('seed', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
})
