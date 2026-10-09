// spec: test/e2e/plan/sign-in.plan.md
// seed: test/e2e/seed.spec.ts
import { expect, test } from '@playwright/test'
import { DashboardPage } from './pages/dashboard-page'
import { SignInPage } from './pages/sign-in-page'

test.describe('Main flow', () => {
  test('Valid account reaches the dashboard', async ({ page }) => {
    const signIn = new SignInPage(page)
    const dashboard = new DashboardPage(page)
    // 1. Go to `/sign-in`.
    await signIn.goto()
    // 2. Fill the "Email" textbox with `ada@example.com`.
    await signIn.email.fill('ada@example.com')
    // 3. Fill the "Password" textbox with `correct-horse-battery`.
    await signIn.password.fill('correct-horse-battery')
    // 4. Click the "Sign in" button.
    await signIn.submit.click()
    // Expect: The URL is `/dashboard`.
    await expect(page).toHaveURL('/dashboard')
    // Expect: The "Dashboard" heading is visible.
    await expect(dashboard.heading).toBeVisible()
    // Expect: The text "Signed in as ada@example.com" is visible.
    await expect(dashboard.signedInAs).toBeVisible()
  })
})

test.describe('Validation', () => {
  test('Empty email is rejected', async ({ page }) => {
    const signIn = new SignInPage(page)
    // 1. Go to `/sign-in`.
    await signIn.goto()
    // 2. Fill the "Password" textbox with `correct-horse-battery`.
    await signIn.password.fill('correct-horse-battery')
    // 3. Click the "Sign in" button.
    await signIn.submit.click()
    // Expect: The alert shows "Enter your email".
    await expect(signIn.error).toHaveText('Enter your email')
    // Expect: The URL is `/sign-in`.
    await expect(page).toHaveURL('/sign-in')
  })

  test('Badly formatted email is rejected', async ({ page }) => {
    const signIn = new SignInPage(page)
    // 1. Go to `/sign-in`.
    await signIn.goto()
    // 2. Fill the "Email" textbox with `ada.example.com`.
    await signIn.email.fill('ada.example.com')
    // 3. Fill the "Password" textbox with `correct-horse-battery`.
    await signIn.password.fill('correct-horse-battery')
    // 4. Click the "Sign in" button.
    await signIn.submit.click()
    // Expect: The alert shows "Enter a valid email address".
    await expect(signIn.error).toHaveText('Enter a valid email address')
    // Expect: The URL is `/sign-in`.
    await expect(page).toHaveURL('/sign-in')
  })

  test('Password shorter than 8 characters is rejected', async ({ page }) => {
    const signIn = new SignInPage(page)
    // 1. Go to `/sign-in`.
    await signIn.goto()
    // 2. Fill the "Email" textbox with `ada@example.com`.
    await signIn.email.fill('ada@example.com')
    // 3. Fill the "Password" textbox with `short`.
    await signIn.password.fill('short')
    // 4. Click the "Sign in" button.
    await signIn.submit.click()
    // Expect: The alert shows "Password must be at least 8 characters".
    await expect(signIn.error).toHaveText('Password must be at least 8 characters')
    // Expect: The URL is `/sign-in`.
    await expect(page).toHaveURL('/sign-in')
  })
})

test.describe('Errors', () => {
  test('Wrong password shows an error', async ({ page }) => {
    const signIn = new SignInPage(page)
    // 1. Go to `/sign-in`.
    await signIn.goto()
    // 2. Fill the "Email" textbox with `ada@example.com`.
    await signIn.email.fill('ada@example.com')
    // 3. Fill the "Password" textbox with `wrong-password`.
    await signIn.password.fill('wrong-password')
    // 4. Click the "Sign in" button.
    await signIn.submit.click()
    // Expect: The alert shows "Email or password is incorrect".
    await expect(signIn.error).toHaveText('Email or password is incorrect')
    // Expect: The URL is `/sign-in`.
    await expect(page).toHaveURL('/sign-in')
    // Expect: The "Sign in" button is enabled.
    await expect(signIn.submit).toBeEnabled()
  })

  test('Server error shows a retry message', async ({ page }) => {
    const signIn = new SignInPage(page)
    // 1. Mock `POST **/api/session` to answer with status 500 and the JSON body `{ "error": "Internal Server Error" }`.
    await page.route('**/api/session', (route) => route.fulfill({ status: 500, json: { error: 'Internal Server Error' } }))
    // 2. Go to `/sign-in`.
    await signIn.goto()
    // 3. Fill the "Email" textbox with `ada@example.com`.
    await signIn.email.fill('ada@example.com')
    // 4. Fill the "Password" textbox with `correct-horse-battery`.
    await signIn.password.fill('correct-horse-battery')
    // 5. Click the "Sign in" button.
    await signIn.submit.click()
    // Expect: The alert shows "Something went wrong. Try again.".
    await expect(signIn.error).toHaveText('Something went wrong. Try again.')
    // Expect: The URL is `/sign-in`.
    await expect(page).toHaveURL('/sign-in')
  })
})
