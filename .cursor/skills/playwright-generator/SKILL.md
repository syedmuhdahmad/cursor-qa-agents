---
name: playwright-generator
description: Turns one markdown plan under test/e2e/plan into a Playwright spec and page classes. Read only when the QA role is asked to generate a spec from a plan.
disable-model-invocation: true
---

# Generate a spec from a plan

Input is one plan, `test/e2e/plan/<name>.plan.md`. If the prompt names no plan, list `test/e2e/plan/` and ask which one. Do not pick.

Output:

- One spec: `test/e2e/<name>.spec.ts`. If it exists, add to it.
- Page classes in `test/e2e/pages/<screen>-page.ts`, following the page-objects skill. Reuse an existing class before adding one.

## Steps

1. Read the plan. Read `test/e2e/pages/` file names so you can reuse classes.
2. Check the app responds at `use.baseURL` from `playwright.config.ts`. If not, stop and tell the user to start it. Do not start servers yourself.
3. For each scenario, walk its steps once with the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`). Each action returns the Playwright code it ran. Copy locators from that code into the page class. Do not invent locators. Call `browser_close` when done.
4. Write the page classes, then the spec.
5. Run only this spec: `npx playwright test test/e2e/<name>.spec.ts`.
6. Read the summary. Require `N passed` with N equal to the number of scenarios, and nothing skipped or flaky.
7. Fix and rerun at most 3 times. Then stop and report, or tell the user to ask for the healer.

## Spec rules

- First two lines: `// spec: test/e2e/plan/<name>.plan.md` and `// seed: test/e2e/seed.spec.ts`.
- One `test.describe` per plan group (`## 1. …`). One `test` per scenario (`### 1.1 …`). The test title is the scenario name.
- A comment with the plan step text before the code for that step.
- Navigate with relative paths (`page.goto('/sign-in')` inside the page class). `baseURL` supplies the host.
- No `waitForTimeout`, no `networkidle`, no `force: true`. Rely on web-first assertions (`await expect(locator).toBeVisible()`).
- UI side: mock network with `await page.route('**/api/<path>', route => route.fulfill({ json: … }))` in the test, before the action that triggers it. API side: no `page.route`.
- Do not use `.only`, `.skip`, `test.fixme()`, or `test.fail()`. Do not weaken an assertion to pass. If the app contradicts the plan, leave the test failing and report the bug with the plan step and source `file:line`.

## Example

```ts
// spec: test/e2e/plan/sign-in.plan.md
// seed: test/e2e/seed.spec.ts
import { expect, test } from '@playwright/test'
import { DashboardPage } from './pages/dashboard-page'
import { SignInPage } from './pages/sign-in-page'

test.describe('Signing in', () => {
  test('Valid account reaches dashboard', async ({ page }) => {
    const signIn = new SignInPage(page)
    // 1. Go to /sign-in.
    await signIn.goto()
    // 2. Sign in with a valid account.
    await signIn.signIn('ada@example.com', 'correct-horse')
    // Expect: the Dashboard heading is visible.
    await expect(new DashboardPage(page).heading).toBeVisible()
  })
})
```

Finish with the files written, the command you ran, and its summary line.
