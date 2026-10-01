---
name: playwright-page-objects
description: Structures Playwright end-to-end tests as page objects. Read only when writing or editing a page class or spec under test/e2e.
paths: test/e2e/**
disable-model-invocation: true
---

# Playwright page objects

Specs are `test/e2e/<name>.spec.ts`. Page classes are `test/e2e/pages/<screen>-page.ts`. Plans are `test/e2e/plan/<name>.plan.md`. The seed is `test/e2e/seed.spec.ts`.

## Page class

- One class per screen or distinct dialog. File `sign-in-page.ts` exports `SignInPage`.
- The constructor takes Playwright `Page`.
- Locators are `readonly` fields set in the constructor. Prefer `getByRole`, then `getByLabel`, then `getByText`. Use `getByTestId` only when none of those is unique. No CSS or XPath.
- Methods are user actions (`goto`, `signIn`, `submit`). `goto` uses a relative path.
- No assertions and no `expect` import in the page class.

```ts
import type { Locator, Page } from '@playwright/test'

export class SignInPage {
  readonly email: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly error: Locator

  constructor(private readonly page: Page) {
    this.email = page.getByRole('textbox', { name: 'Email' })
    this.password = page.getByLabel('Password')
    this.submit = page.getByRole('button', { name: 'Sign in' })
    this.error = page.getByRole('alert')
  }

  async goto() {
    await this.page.goto('/sign-in')
  }

  async signIn(email: string, password: string) {
    await this.email.fill(email)
    await this.password.fill(password)
    await this.submit.click()
  }
}
```

## Spec

- Import page classes. Actions go through page-class methods. Assertions use `expect` on page-class locators.
- No raw selectors in the spec. If an assertion needs a new locator, add a field to the page class.
- One scenario per `test`. Group scenarios in `test.describe`.
- The plan path and seed path are commented on the first two lines.

```ts
// spec: test/e2e/plan/sign-in.plan.md
// seed: test/e2e/seed.spec.ts
import { expect, test } from '@playwright/test'
import { SignInPage } from './pages/sign-in-page'

test('shows an error for a wrong password', async ({ page }) => {
  const signIn = new SignInPage(page)
  await signIn.goto()
  await signIn.signIn('ada@example.com', 'wrong')
  await expect(signIn.error).toHaveText('Email or password is incorrect')
})
```
