import { createElement } from 'react'
import { render, screen, userEvent, waitFor } from '@testing-library/react-native'
import * as auth from '../../../lib/auth'
import { SignIn } from '../../../src/components/SignIn'

afterEach(() => {
  jest.restoreAllMocks()
})

// Renders the form with an onSignedIn callback the test can inspect.
async function renderSignIn() {
  const onSignedIn = jest.fn()
  const user = userEvent.setup()
  await render(createElement(SignIn, { onSignedIn }))
  return { onSignedIn, user }
}

// Types into the fields as a user does. An empty value leaves its field untouched.
async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) {
    await user.type(screen.getByLabelText('Email'), email)
  }
  if (password) {
    await user.type(screen.getByLabelText('Password'), password)
  }
  await user.press(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignIn', () => {
  it('shows the email field, the password field, and the sign-in button', async () => {
    await renderSignIn()

    expect(screen.getByLabelText('Email')).toBeOnTheScreen()
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen()
  })

  it('asks for an email and does not sign in when the email is empty', async () => {
    const signInSpy = jest.spyOn(auth, 'signIn')
    const { onSignedIn, user } = await renderSignIn()

    await fillAndSubmit(user, '', 'correct-horse-battery')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email')
    expect(signInSpy).not.toHaveBeenCalled()
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('rejects a badly formatted email and does not sign in', async () => {
    const signInSpy = jest.spyOn(auth, 'signIn')
    const { onSignedIn, user } = await renderSignIn()

    await fillAndSubmit(user, 'ada.example.com', 'correct-horse-battery')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(signInSpy).not.toHaveBeenCalled()
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('rejects a password shorter than 8 characters and does not sign in', async () => {
    const signInSpy = jest.spyOn(auth, 'signIn')
    const { onSignedIn, user } = await renderSignIn()

    await fillAndSubmit(user, 'ada@example.com', 'short')

    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters')
    expect(signInSpy).not.toHaveBeenCalled()
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('signs in the demo account and passes the user to onSignedIn', async () => {
    const signInSpy = jest.spyOn(auth, 'signIn')
    const { onSignedIn, user } = await renderSignIn()

    await fillAndSubmit(user, 'ada@example.com', 'correct-horse-battery')

    await waitFor(() =>
      expect(onSignedIn).toHaveBeenCalledWith({ id: 'u_1', email: 'ada@example.com', name: 'Ada Lovelace' }),
    )
    expect(signInSpy).toHaveBeenCalledTimes(1)
    expect(signInSpy).toHaveBeenCalledWith('ada@example.com', 'correct-horse-battery')
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen()
  })

  it('signs in when the email has capitals and spaces around it', async () => {
    const { onSignedIn, user } = await renderSignIn()

    await fillAndSubmit(user, '  Ada@Example.COM ', 'correct-horse-battery')

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1))
    expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com' }))
  })

  it('shows "Email or password is incorrect" for a wrong password and stays on the form', async () => {
    const { onSignedIn, user } = await renderSignIn()

    await fillAndSubmit(user, 'ada@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('shows a server error message when signing in fails', async () => {
    jest.spyOn(auth, 'signIn').mockRejectedValue(new Error('offline'))
    const { onSignedIn, user } = await renderSignIn()

    await fillAndSubmit(user, 'ada@example.com', 'correct-horse-battery')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('disables the button while signing in', async () => {
    let finish: (user: auth.User | null) => void = () => {}
    jest.spyOn(auth, 'signIn').mockReturnValue(
      new Promise<auth.User | null>((resolve) => {
        finish = resolve
      }),
    )
    const { user } = await renderSignIn()

    await fillAndSubmit(user, 'ada@example.com', 'correct-horse-battery')
    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button).toBeDisabled()

    finish(null)
    await waitFor(() => expect(button).toBeEnabled())
  })
})
