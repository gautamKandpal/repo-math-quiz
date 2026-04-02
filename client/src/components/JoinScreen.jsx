import { useState } from 'react'

export default function JoinScreen({ onJoin }) {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const name = displayName.trim()
    if (!name) {
      setError('Please enter a display name.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      })

      const data = await res.json()

      if (res.ok) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('userId', data.userId)
        localStorage.setItem('displayName', data.displayName)
        onJoin({ token: data.token, userId: data.userId, displayName: data.displayName })
      } else if (res.status === 409) {
        setError('That display name is already taken. Please choose another.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Unable to connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Welcome to the Real-Time Math Quiz</h1>
      <p style={styles.subtitle}>Test your mathematical skills, compete with others, and be the first to solve the problem!</p>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your display name"
          maxLength={30}
          disabled={loading}
          style={styles.input}
          aria-label="Display name"
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Joining…' : 'Join Game'}
        </button>
      </form>
      {error && <p style={styles.error} role="alert">{error}</p>}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '12px',
    padding: '20px',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: 'sans-serif',
  },
  title: {
    fontSize: '2rem',
    margin: 0,
    color: '#f8fafc',
    fontWeight: '700',
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
  },
  form: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  input: {
    padding: '10px 14px',
    fontSize: '1rem',
    borderRadius: '8px',
    border: '2px solid #3b82f6',
    background: '#0f172a',
    color: '#f1f5f9',
    width: '220px',
    outline: 'none',
  },
  button: {
    padding: '10px 20px',
    fontSize: '1rem',
    fontWeight: '600',
    borderRadius: '8px',
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
  },
  error: {
    color: '#fca5a5',
    margin: 0,
    fontSize: '0.9rem',
  },
}
