// spec: test/e2e/plan/FEATURE.plan.md
// seed: test/e2e/seed.spec.ts
import { expect, test } from '@playwright/test'
import { CLASS } from './pages/SCREEN-page'

test.describe('GROUP', () => {
  test('SCENARIO', async ({ page }) => {
    const OBJECT = new CLASS(page)
    // STEP
    await OBJECT.goto()
    // STEP
    await OBJECT.FIELD.fill('VALUE')
    // STEP
    await OBJECT.FIELD.click()
    // Expect: EXPECT
    await expect(OBJECT.FIELD).toHaveText('TEXT')
  })
})
