import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { signIn, type User } from '../../lib/auth'
import { validateEmail, validatePassword } from '../../lib/validation'

const WRONG_CREDENTIALS = 'Email or password is incorrect'
const SERVER_ERROR = 'Something went wrong. Try again.'

type Props = {
  onSignedIn: (user: User) => void
}

export function SignIn({ onSignedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit() {
    const problem = validateEmail(email) ?? validatePassword(password)
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setPending(true)
    try {
      const user = await signIn(email, password)
      if (user) {
        onSignedIn(user)
        return
      }
      setError(WRONG_CREDENTIALS)
    } catch {
      setError(SERVER_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Email</Text>
      <TextInput
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        style={styles.input}
        testID="sign-in-email"
        value={email}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        testID="sign-in-password"
        value={password}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={styles.error}
          testID="sign-in-error"
        >
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={pending}
        onPress={handleSubmit}
        style={({ pressed }) => [styles.button, (pressed || pending) && styles.buttonDimmed]}
        testID="sign-in-submit"
      >
        <Text style={styles.buttonText}>Sign in</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: 8,
  },
  label: {
    fontSize: 16,
  },
  input: {
    borderColor: '#888',
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    color: '#b00020',
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#1f4ed8',
    borderRadius: 6,
    marginTop: 8,
    paddingVertical: 12,
  },
  buttonDimmed: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
