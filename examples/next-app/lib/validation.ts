// Sign-in rules shared by the form (src/components/SignIn.tsx) and the
// session route (app/api/session/route.ts). Each validator returns the
// message to show, or null when the value is valid.

export const MIN_PASSWORD_LENGTH = 8

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Enter your email'
  }
  if (!EMAIL_PATTERN.test(value.trim())) {
    return 'Enter a valid email address'
  }
  return null
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    return 'Password must be at least 8 characters'
  }
  return null
}
