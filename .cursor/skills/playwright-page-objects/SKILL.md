---
name: playwright-page-objects
description: Structures Playwright end-to-end tests as page objects. Read only when writing or editing a page class or spec under test/e2e.
paths: test/e2e/**
disable-model-invocation: true
---

# Playwright page objects

Specs stay in `test/e2e/*.spec.ts`. Page classes stay in `test/e2e/pages/`. Plans stay in `test/e2e/plan/*.plan.md`. The seed is `test/e2e/seed.spec.ts`.

## Page class

- One class per screen or distinct dialog.
- The constructor takes Playwright `Page`.
- Locators are readonly fields. Prefer `getByRole`, then `getByLabel`, then `getByText`.
- Methods are user actions (`goto`, `signIn`, `submit`) and return another page object when navigation changes screen.
- No assertions in the page class.

```ts
import { expect, type Locator, type Page } from '@playwright/test'

export class SignInPage {
  readonly email: Locator
  readonly submit: Locator

  constructor(private readonly page: Page) {
    this.email = page.getByRole('textbox', { name: 'Email' })
    this.submit = page.getByRole('button', { name: 'Sign in' })
  }

  async goto() {
    await this.page.goto('/sign-in')
  }

  async signIn(email: string, password: string) {
    await this.email.fill(email)
    await this.page.getByLabel('Password').fill(password)
    await this.submit.click()
  }
}
```

## Spec

- Import the page class. Keep assertions in the spec with `expect`.
- Comment the plan path and the seed path at the top of the file.
- One scenario per `test`. Group related scenarios in `test.describe`.
- Do not put raw selectors in the spec.

```ts
// spec: test/e2e/plan/sign-in.plan.md
// seed: test/e2e/seed.spec.ts
import { expect, test } from '@playwright/test'
import { SignInPage } from './pages/sign-in-page'

test('signs in with a valid account', async ({ page }) => {
  const signIn = new SignInPage(page)
  await signIn.goto()
  await signIn.signIn('ada@example.com', 'correct-horse')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
```
