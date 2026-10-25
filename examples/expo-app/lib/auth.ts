import { normalizeEmail } from './validation'

// A local stand-in for a sign-in server. Nothing leaves the device, and the
// account lives in memory. The short wait gives the form a pending state.

export type User = {
  id: string
  email: string
  name: string
}

type Account = {
  user: User
  password: string
}

export const SIGN_IN_DELAY_MS = 300

const accounts: Account[] = [
  {
    user: { id: 'u_1', email: 'ada@example.com', name: 'Ada Lovelace' },
    password: 'correct-horse-battery',
  },
]

// Resolves to the user when the email and the password match an account,
// and to null when they do not.
export async function signIn(email: string, password: string): Promise<User | null> {
  await new Promise((resolve) => setTimeout(resolve, SIGN_IN_DELAY_MS))
  const account = accounts.find((candidate) => candidate.user.email === normalizeEmail(email))
  if (!account || account.password !== password) {
    return null
  }
  return account.user
}
