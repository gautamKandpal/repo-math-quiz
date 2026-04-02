import { useState, useEffect } from 'react'

export default function Leaderboard({ socket }) {
  const [entries, setEntries] = useState([])

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(data => setEntries(data.leaderboard ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!socket) return

    function onLeaderboardUpdated({ leaderboard }) {
      setEntries(leaderboard ?? [])
    }

    socket.on('leaderboard_updated', onLeaderboardUpdated)
    return () => socket.off('leaderboard_updated', onLeaderboardUpdated)
  }, [socket])

  if (entries.length === 0) return null

  return (
    <div style={{
      background: '#1e293b',
      borderRadius: '12px',
      padding: '20px 24px',
      marginTop: '24px',
    }}>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Leaderboard
      </p>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {entries.map(({ rank, displayName, winCount }) => (
          <li key={rank} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 0',
            borderBottom: '1px solid #334155',
          }}>
            <span style={{ width: '24px', textAlign: 'right', fontSize: '13px', color: '#64748b', flexShrink: 0 }}>
              {rank}
            </span>
            <span style={{ flex: 1, fontSize: '15px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
            <span style={{ fontSize: '14px', color: '#94a3b8', flexShrink: 0 }}>
              {winCount} {winCount === 1 ? 'win' : 'wins'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
