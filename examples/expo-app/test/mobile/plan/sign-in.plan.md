# sign-in plan

**Walked on:** Android
**App id (Android):** `com.example.qasignin`
**App id (iOS):** `not given`
**Source:** `src/components/SignIn.tsx`
**Data:** the account `ada@example.com` with the password `correct-horse-battery`

## 1. Main flow

### 1.1 Valid account reaches the dashboard

**Flow:** `test/mobile/sign-in/01-valid-account.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. On the Sign in screen, type `ada@example.com` into "Email".
3. On the Sign in screen, type `correct-horse-battery` into "Password".
4. On the Sign in screen, tap "Sign in".

**Expect:**

- On the Dashboard screen, "Dashboard" is visible.
- On the Dashboard screen, "Signed in as ada@example.com" is visible.

### 1.2 Sign out returns to the sign-in screen

**Flow:** `test/mobile/sign-in/02-sign-out.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. On the Sign in screen, type `ada@example.com` into "Email".
3. On the Sign in screen, type `correct-horse-battery` into "Password".
4. On the Sign in screen, tap "Sign in".
5. On the Dashboard screen, tap "Sign out".

**Expect:**

- On the Sign in screen, "Sign in" is visible.
- On the Sign in screen, "Signed in as ada@example.com" is not visible.

## 2. Validation

### 2.1 Empty email is rejected

**Flow:** `test/mobile/sign-in/03-empty-email.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. On the Sign in screen, type `correct-horse-battery` into "Password".
3. On the Sign in screen, tap "Sign in".

**Expect:**

- On the Sign in screen, "Enter your email" is visible.

### 2.2 Badly formatted email is rejected

**Flow:** `test/mobile/sign-in/04-bad-email.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. On the Sign in screen, type `ada.example.com` into "Email".
3. On the Sign in screen, type `correct-horse-battery` into "Password".
4. On the Sign in screen, tap "Sign in".

**Expect:**

- On the Sign in screen, "Enter a valid email address" is visible.

### 2.3 Password shorter than 8 characters is rejected

**Flow:** `test/mobile/sign-in/05-short-password.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. On the Sign in screen, type `ada@example.com` into "Email".
3. On the Sign in screen, type `short` into "Password".
4. On the Sign in screen, tap "Sign in".

**Expect:**

- On the Sign in screen, "Password must be at least 8 characters" is visible.

## 3. Errors

### 3.1 Wrong password shows an error

**Flow:** `test/mobile/sign-in/06-wrong-password.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. On the Sign in screen, type `ada@example.com` into "Email".
3. On the Sign in screen, type `wrong-password` into "Password".
4. On the Sign in screen, tap "Sign in".

**Expect:**

- On the Sign in screen, "Email or password is incorrect" is visible.
