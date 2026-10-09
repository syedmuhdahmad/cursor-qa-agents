// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignIn } from '../../../src/components/SignIn'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

import { useRouter } from 'next/navigation'

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

// Renders the form with a router whose push() the test can inspect.
function renderSignIn() {
  const push = vi.fn()
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>)
  render(createElement(SignIn))
  return { push }
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignIn', () => {
  it('shows the email field, the password field, and the sign-in button', () => {
    renderSignIn()

    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks for an email and sends nothing when the email is empty', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    renderSignIn()

    fillAndSubmit('', 'correct-horse-battery')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a badly formatted email and sends nothing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    renderSignIn()

    fillAndSubmit('ada.example.com', 'correct-horse-battery')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a password shorter than 8 characters and sends nothing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    renderSignIn()

    fillAndSubmit('ada@example.com', 'short')

    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts the credentials to /api/session and goes to /dashboard on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ user: { id: 'u_1', email: 'ada@example.com', name: 'Ada Lovelace' } }))
    const { push } = renderSignIn()

    fillAndSubmit('ada@example.com', 'correct-horse-battery')

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct-horse-battery' }),
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows "Email or password is incorrect" on a 401 and stays on the page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'Email or password is incorrect' }, { status: 401 }),
    )
    const { push } = renderSignIn()

    fillAndSubmit('ada@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect')
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a server error message on a 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    const { push } = renderSignIn()

    fillAndSubmit('ada@example.com', 'correct-horse-battery')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a server error message when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const { push } = renderSignIn()

    fillAndSubmit('ada@example.com', 'correct-horse-battery')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(push).not.toHaveBeenCalled()
  })

  it('disables the button while the request is in flight', async () => {
    let respond: (response: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve
      }),
    )
    renderSignIn()

    fillAndSubmit('ada@example.com', 'correct-horse-battery')
    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button).toBeDisabled()

    respond(new Response(null, { status: 500 }))
    await waitFor(() => expect(button).toBeEnabled())
  })
})
