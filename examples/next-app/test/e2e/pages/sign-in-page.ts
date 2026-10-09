import type { Locator, Page } from '@playwright/test'

export class SignInPage {
  readonly email: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly error: Locator

  constructor(private readonly page: Page) {
    this.email = page.getByRole('textbox', { name: 'Email' })
    this.password = page.getByRole('textbox', { name: 'Password' })
    this.submit = page.getByRole('button', { name: 'Sign in' })
    // Next.js adds its own alert to every page, outside main.
    // The form's alert is the one inside main.
    this.error = page.getByRole('main').getByRole('alert')
  }

  async goto() {
    await this.page.goto('/sign-in')
  }
}
