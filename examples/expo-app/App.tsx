import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { User } from './lib/auth'
import { Dashboard } from './src/components/Dashboard'
import { SignIn } from './src/components/SignIn'

// Shows the sign-in screen until a user signs in, then the dashboard.
// The signed-in user is kept in memory only.
export default function App() {
  const [user, setUser] = useState<User | null>(null)

  return (
    <View style={styles.screen}>
      {user ? (
        <Dashboard user={user} onSignOut={() => setUser(null)} />
      ) : (
        <SignIn onSignedIn={setUser} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fff',
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 96,
  },
})
