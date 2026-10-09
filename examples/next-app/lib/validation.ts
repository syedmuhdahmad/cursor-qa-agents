// Sign-in rules shared by the form (src/components/SignIn.tsx) and the
// session route (app/api/session/route.ts). Each validator returns the
// message to show, or null when the value is valid.

export const MIN_PASSWORD_LENGTH = 8

const isEmail = (v: string) => { const [name, domain, ...rest] = v.split('@'); return !/\s/.test(v) && rest.length === 0 && !!name && !!domain && domain.slice(1, -1).includes('.') }

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Enter your email'
  }
  if (!isEmail(value.trim())) {
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
