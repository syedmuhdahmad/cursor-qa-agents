import { afterEach, describe, expect, it, vi } from 'vitest'
import { DELETE, GET, POST } from '../../../../app/api/session/route'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))
vi.mock('../../../../lib/db', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  findSession: vi.fn(),
  findUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
}))

import { cookies } from 'next/headers'
import {
  createSession,
  deleteSession,
  findSession,
  findUserByEmail,
  verifyPassword,
} from '../../../../lib/db'

const ada = { id: 'u_1', email: 'ada@example.com', name: 'Ada Lovelace' }

afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

// Makes cookies() resolve to a store the test can inspect. Pass a token to
// act as a request that carries the session cookie.
function mockCookies(token?: string) {
  const store = {
    get: vi.fn().mockReturnValue(token ? { name: 'session', value: token } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }
  vi.mocked(cookies).mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>)
  return store
}

function post(body: string) {
  return POST(
    new Request('http://test/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  )
}

describe('POST /api/session', () => {
  it('returns 400 when the body is not JSON', async () => {
    const store = mockCookies()

    const res = await post('not json')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Request body must be JSON' })
    expect(store.set).not.toHaveBeenCalled()
  })

  it('returns 400 when the email is missing', async () => {
    mockCookies()

    const res = await post(JSON.stringify({ password: 'correct-horse-battery' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Enter your email' })
    expect(findUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when the email is malformed', async () => {
    mockCookies()

    const res = await post(JSON.stringify({ email: 'ada.example.com', password: 'correct-horse-battery' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Enter a valid email address' })
    expect(findUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when the password is shorter than 8 characters', async () => {
    mockCookies()

    const res = await post(JSON.stringify({ email: 'ada@example.com', password: 'short' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Password must be at least 8 characters' })
    expect(findUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 401 when no user has that email', async () => {
    const store = mockCookies()
    vi.mocked(findUserByEmail).mockResolvedValue(undefined)

    const res = await post(JSON.stringify({ email: 'nobody@example.com', password: 'correct-horse-battery' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Email or password is incorrect' })
    expect(verifyPassword).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('returns 401 when the password is wrong', async () => {
    const store = mockCookies()
    vi.mocked(findUserByEmail).mockResolvedValue(ada)
    vi.mocked(verifyPassword).mockResolvedValue(false)

    const res = await post(JSON.stringify({ email: 'ada@example.com', password: 'wrong-password' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Email or password is incorrect' })
    expect(verifyPassword).toHaveBeenCalledWith(ada, 'wrong-password')
    expect(createSession).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('returns 200 with the user and sets an httpOnly session cookie', async () => {
    const store = mockCookies()
    vi.mocked(findUserByEmail).mockResolvedValue(ada)
    vi.mocked(verifyPassword).mockResolvedValue(true)
    vi.mocked(createSession).mockResolvedValue('token-1')

    const res = await post(JSON.stringify({ email: 'ada@example.com', password: 'correct-horse-battery' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: ada })
    expect(createSession).toHaveBeenCalledWith('u_1')
    expect(store.set).toHaveBeenCalledWith('session', 'token-1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  })

  it('looks the user up by the trimmed, lowercased email', async () => {
    mockCookies()
    vi.mocked(findUserByEmail).mockResolvedValue(undefined)

    await post(JSON.stringify({ email: '  Ada@Example.COM ', password: 'correct-horse-battery' }))

    expect(findUserByEmail).toHaveBeenCalledWith('ada@example.com')
  })
})

describe('GET /api/session', () => {
  it('returns 401 when there is no session cookie', async () => {
    mockCookies()

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not signed in' })
    expect(findSession).not.toHaveBeenCalled()
  })

  it('returns 401 when the cookie names no stored session', async () => {
    mockCookies('stale-token')
    vi.mocked(findSession).mockResolvedValue(undefined)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not signed in' })
    expect(findSession).toHaveBeenCalledWith('stale-token')
  })

  it('returns 200 with the user for a stored session', async () => {
    mockCookies('token-1')
    vi.mocked(findSession).mockResolvedValue({ token: 'token-1', user: ada })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: ada })
  })
})

describe('DELETE /api/session', () => {
  it('returns 204, deletes the session, and clears the cookie', async () => {
    const store = mockCookies('token-1')

    const res = await DELETE()

    expect(res.status).toBe(204)
    expect(deleteSession).toHaveBeenCalledWith('token-1')
    expect(store.delete).toHaveBeenCalledWith('session')
  })

  it('returns 204 and clears the cookie when nobody is signed in', async () => {
    const store = mockCookies()

    const res = await DELETE()

    expect(res.status).toBe(204)
    expect(deleteSession).not.toHaveBeenCalled()
    expect(store.delete).toHaveBeenCalledWith('session')
  })
})
