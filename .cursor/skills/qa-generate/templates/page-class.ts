import type { Locator, Page } from '@playwright/test'

export class CLASS {
  readonly FIELD: Locator

  constructor(private readonly page: Page) {
    this.FIELD = LOCATOR
  }

  async goto() {
    await this.page.goto('ROUTE')
  }
}
