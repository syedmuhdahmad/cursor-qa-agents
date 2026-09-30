import { test, expect } from '@playwright/test'

test('seed', async ({ page }) => {
  await page.goto('about:blank')
  await expect(page).toHaveURL('about:blank')
})
