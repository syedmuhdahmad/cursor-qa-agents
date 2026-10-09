'use client'

import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateEmail, validatePassword } from '@/lib/validation'

const WRONG_CREDENTIALS = 'Email or password is incorrect'
const SERVER_ERROR = 'Something went wrong. Try again.'

export function SignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const problem = validateEmail(email) ?? validatePassword(password)
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setPending(true)
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (response.ok) {
        router.push('/dashboard')
        return
      }
      setError(response.status === 401 ? WRONG_CREDENTIALS : SERVER_ERROR)
    } catch {
      setError(SERVER_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="sign-in-password">Password</label>
        <input
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={pending}>
        Sign in
      </button>
    </form>
  )
}
