import { cookies } from 'next/headers'
import {
  createSession,
  deleteSession,
  findSession,
  findUserByEmail,
  verifyPassword,
} from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session'
import { normalizeEmail, validateEmail, validatePassword } from '@/lib/validation'

// POST /api/session signs in. The body is JSON: { email, password }.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 })
  }

  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const problem = validateEmail(fields.email) ?? validatePassword(fields.password)
  if (problem) {
    return Response.json({ error: problem }, { status: 400 })
  }

  const user = await findUserByEmail(normalizeEmail(fields.email as string))
  if (!user || !(await verifyPassword(user, fields.password as string))) {
    return Response.json({ error: 'Email or password is incorrect' }, { status: 401 })
  }

  const token = await createSession(user.id)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' })
  return Response.json({ user })
}

// GET /api/session returns the signed-in user.
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const session = token ? await findSession(token) : undefined
  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }
  return Response.json({ user: session.user })
}

// DELETE /api/session signs out.
export async function DELETE() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    await deleteSession(token)
  }
  cookieStore.delete(SESSION_COOKIE)
  return new Response(null, { status: 204 })
}
