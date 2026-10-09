import 'server-only'
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

// An in-memory stand-in for a database. Data is lost when the server restarts.

export type User = {
  id: string
  email: string
  name: string
}

export type Session = {
  token: string
  user: User
}

function hashPassword(password: string): Buffer {
  return scryptSync(password, 'example-app-fixed-salt', 32)
}

const users: User[] = [{ id: 'u_1', email: 'ada@example.com', name: 'Ada Lovelace' }]

const passwordHashes = new Map<string, Buffer>([['u_1', hashPassword('correct-horse-battery')]])

// Next.js can load this module more than once (one copy for route handlers,
// one for pages), so the sessions live on globalThis to be shared.
const store = globalThis as typeof globalThis & { __exampleSessions?: Map<string, string> }
const sessions = (store.__exampleSessions ??= new Map<string, string>())

export async function findUserByEmail(email: string): Promise<User | undefined> {
  return users.find((user) => user.email === email)
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  const expected = passwordHashes.get(user.id)
  if (!expected) {
    return false
  }
  return timingSafeEqual(expected, hashPassword(password))
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID()
  sessions.set(token, userId)
  return token
}

export async function findSession(token: string): Promise<Session | undefined> {
  const userId = sessions.get(token)
  const user = users.find((candidate) => candidate.id === userId)
  return user ? { token, user } : undefined
}

export async function deleteSession(token: string): Promise<void> {
  sessions.delete(token)
}
