import { useState } from 'react'
import JoinScreen from './components/JoinScreen'
import GameScreen from './components/GameScreen'

function App() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('token')
    const userId = localStorage.getItem('userId')
    const displayName = localStorage.getItem('displayName')
    return token ? { token, userId, displayName } : null
  })

  function handleJoin(authData) {
    setAuth(authData)
  }

  if (!auth) {
    return <JoinScreen onJoin={handleJoin} />
  }

  return <GameScreen token={auth.token} userId={auth.userId} displayName={auth.displayName} />
}

export default App
