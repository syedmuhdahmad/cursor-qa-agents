import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { User } from '../../lib/auth'

type Props = {
  user: User
  onSignOut: () => void
}

export function Dashboard({ user, onSignOut }: Props) {
  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" style={styles.heading} testID="dashboard-heading">
        Dashboard
      </Text>
      <Text style={styles.text} testID="dashboard-signed-in">
        Signed in as {user.email}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onSignOut}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        testID="dashboard-sign-out"
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    gap: 8,
  },
  heading: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    borderColor: '#1f4ed8',
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 16,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#1f4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
})
