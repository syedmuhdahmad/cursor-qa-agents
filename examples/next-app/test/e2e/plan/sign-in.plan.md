# sign-in plan

**Seed:** `test/e2e/seed.spec.ts`
**Side:** UI
**Route:** `/sign-in`
**Data:** the account `ada@example.com` with the password `correct-horse-battery`

## 1. Main flow

### 1.1 Valid account reaches the dashboard

**Steps:**

1. Go to `/sign-in`.
2. Fill the "Email" textbox with `ada@example.com`.
3. Fill the "Password" textbox with `correct-horse-battery`.
4. Click the "Sign in" button.

**Expect:**

- The URL is `/dashboard`.
- The "Dashboard" heading is visible.
- The text "Signed in as ada@example.com" is visible.

## 2. Validation

### 2.1 Empty email is rejected

**Steps:**

1. Go to `/sign-in`.
2. Fill the "Password" textbox with `correct-horse-battery`.
3. Click the "Sign in" button.

**Expect:**

- The alert shows "Enter your email".
- The URL is `/sign-in`.

### 2.2 Badly formatted email is rejected

**Steps:**

1. Go to `/sign-in`.
2. Fill the "Email" textbox with `ada.example.com`.
3. Fill the "Password" textbox with `correct-horse-battery`.
4. Click the "Sign in" button.

**Expect:**

- The alert shows "Enter a valid email address".
- The URL is `/sign-in`.

### 2.3 Password shorter than 8 characters is rejected

**Steps:**

1. Go to `/sign-in`.
2. Fill the "Email" textbox with `ada@example.com`.
3. Fill the "Password" textbox with `short`.
4. Click the "Sign in" button.

**Expect:**

- The alert shows "Password must be at least 8 characters".
- The URL is `/sign-in`.

## 3. Errors

### 3.1 Wrong password shows an error

**Steps:**

1. Go to `/sign-in`.
2. Fill the "Email" textbox with `ada@example.com`.
3. Fill the "Password" textbox with `wrong-password`.
4. Click the "Sign in" button.

**Expect:**

- The alert shows "Email or password is incorrect".
- The URL is `/sign-in`.
- The "Sign in" button is enabled.

### 3.2 Server error shows a retry message

**Steps:**

1. Mock `POST **/api/session` to answer with status 500 and the JSON body `{ "error": "Internal Server Error" }`.
2. Go to `/sign-in`.
3. Fill the "Email" textbox with `ada@example.com`.
4. Fill the "Password" textbox with `correct-horse-battery`.
5. Click the "Sign in" button.

**Expect:**

- The alert shows "Something went wrong. Try again.".
- The URL is `/sign-in`.
