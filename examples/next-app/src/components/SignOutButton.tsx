'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    setPending(true)
    try {
      await fetch('/api/session', { method: 'DELETE' })
      router.push('/sign-in')
    } finally {
      setPending(false)
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={pending}>
      Sign out
    </button>
  )
}
