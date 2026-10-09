import type { Locator, Page } from '@playwright/test'

export class DashboardPage {
  readonly heading: Locator
  readonly signedInAs: Locator

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Dashboard' })
    this.signedInAs = page.getByText('Signed in as ada@example.com')
  }

  async goto() {
    await this.page.goto('/dashboard')
  }
}
