import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { findSession } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session'
import { SignOutButton } from '@/src/components/SignOutButton'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const session = token ? await findSession(token) : undefined
  if (!session) {
    redirect('/sign-in')
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {session.user.email}</p>
      <SignOutButton />
    </main>
  )
}
