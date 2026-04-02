import { useState, useEffect, useRef } from 'react'
import useSocket from '../hooks/useSocket'
import Leaderboard from './Leaderboard'

export default function GameScreen({ token, displayName }) {
  const { socket, connected } = useSocket(token)

  const [roundId, setRoundId] = useState(null)
  const [expression, setExpression] = useState(null)
  const [roundState, setRoundState] = useState('waiting')
  const [answer, setAnswer] = useState('')
  const [ackMessage, setAckMessage] = useState(null)
  const [ackCorrect, setAckCorrect] = useState(null)
  const [roundEndInfo, setRoundEndInfo] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)
  const [toasts, setToasts] = useState([])

  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const toastIdRef = useRef(0)

  function addToast(message, type) {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  function startRoundTimer(secs) {
    clearInterval(timerRef.current)
    setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    if (!socket) return

    function onRoundStarted({ roundId, expression, startedAt, timeoutSecs }) {
      setRoundId(roundId)
      setExpression(expression)
      setRoundState('active')
      setAckMessage(null)
      setAckCorrect(null)
      setRoundEndInfo(null)
      setCountdown(null)
      setAnswer('')
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      startRoundTimer(Math.max(1, (timeoutSecs ?? 60) - elapsed))
      if (inputRef.current) inputRef.current.focus()
    }

    function onRoundEnded({ winnerName, winnerId, correctAnswer, reason }) {
      setRoundState('ended')
      setRoundEndInfo({ winnerName, winnerId, correctAnswer, reason })
      setExpression(null)
      clearInterval(timerRef.current)
      setTimeLeft(null)
    }

    function onCountdownTick({ secondsRemaining }) {
      setRoundState('countdown')
      setCountdown(secondsRemaining)
    }

    function onSubmissionAck({ correct, message }) {
      setAckCorrect(correct)
      setAckMessage(message)
    }

    function onUserJoined({ displayName: name, reconnected }) {
      if (name === displayName) return
      addToast(reconnected ? `${name} reconnected` : `${name} joined the game`, 'join')
    }

    function onUserLeft({ displayName: name }) {
      addToast(`${name} left the game`, 'leave')
    }

    socket.on('round_started', onRoundStarted)
    socket.on('round_ended', onRoundEnded)
    socket.on('countdown_tick', onCountdownTick)
    socket.on('submission_ack', onSubmissionAck)
    socket.on('user_joined', onUserJoined)
    socket.on('user_left', onUserLeft)

    return () => {
      socket.off('round_started', onRoundStarted)
      socket.off('round_ended', onRoundEnded)
      socket.off('countdown_tick', onCountdownTick)
      socket.off('submission_ack', onSubmissionAck)
      socket.off('user_joined', onUserJoined)
      socket.off('user_left', onUserLeft)
      clearInterval(timerRef.current)
    }
  }, [socket])

  const isInputDisabled = roundState !== 'active'

  const timerColor = timeLeft === null ? '#64748b'
    : timeLeft > 20 ? '#4ade80'
    : timeLeft > 10 ? '#fbbf24'
    : '#f87171'

  function handleSubmit(e) {
    e.preventDefault()
    if (!socket || !roundId || isInputDisabled || answer.trim() === '') return
    socket.emit('submit_answer', { roundId, answer: answer.trim() })
    setAnswer('')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'sans-serif', padding: '24px' }}>

      {/* Toast notifications */}
      <div style={{ position: 'fixed', top: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 100 }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            background: toast.type === 'join' ? '#14532d' : '#1e293b',
            color: toast.type === 'join' ? '#86efac' : '#94a3b8',
            border: `1px solid ${toast.type === 'join' ? '#166534' : '#334155'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            {toast.type === 'join' ? '👋 ' : '🚪 '}{toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '14px', color: '#94a3b8' }}>
          Logged in as: <strong style={{ color: '#f1f5f9' }}>{displayName}</strong>
        </span>
        <span style={{
          fontSize: '12px', padding: '4px 10px', borderRadius: '9999px',
          background: connected ? '#166534' : '#7f1d1d',
          color: connected ? '#bbf7d0' : '#fecaca',
        }}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>

      {/* Page title */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#f8fafc' }}>
          Let's Start Solving! 🧠
        </h1>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Question card */}
        <div style={{
          background: '#1e293b', borderRadius: '12px', padding: '32px',
          textAlign: 'center', marginBottom: '16px', minHeight: '140px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', position: 'relative',
        }}>
          {timeLeft !== null && roundState === 'active' && (
            <div style={{
              position: 'absolute', top: '14px', right: '16px',
              fontSize: '13px', fontWeight: '600', color: timerColor,
              background: '#0f172a', padding: '3px 10px', borderRadius: '9999px',
              border: `1px solid ${timerColor}`,
            }}>
              ⏱ {timeLeft}s
            </div>
          )}
          {expression ? (
            <>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Solve this
              </p>
              <p style={{ fontSize: '48px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.02em' }}>
                {expression}
              </p>
            </>
          ) : (
            <p style={{ color: '#475569', fontSize: '18px' }}>
              {countdown !== null ? `Next round in ${countdown}s…` : 'Waiting for the next round…'}
            </p>
          )}
        </div>

        {/* Answer form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder={isInputDisabled ? 'Round not active' : 'Your answer…'}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            disabled={isInputDisabled}
            style={{
              flex: 1, padding: '12px 16px', fontSize: '18px', borderRadius: '8px',
              border: '2px solid', borderColor: isInputDisabled ? '#334155' : '#3b82f6',
              background: isInputDisabled ? '#1e293b' : '#0f172a',
              color: isInputDisabled ? '#475569' : '#f1f5f9',
              outline: 'none', transition: 'border-color 0.15s',
            }}
          />
          <button
            type="submit"
            disabled={isInputDisabled || answer.trim() === ''}
            style={{
              padding: '12px 24px', fontSize: '16px', fontWeight: '600',
              borderRadius: '8px', border: 'none',
              cursor: isInputDisabled || answer.trim() === '' ? 'not-allowed' : 'pointer',
              background: isInputDisabled || answer.trim() === '' ? '#334155' : '#3b82f6',
              color: isInputDisabled || answer.trim() === '' ? '#64748b' : '#fff',
              transition: 'background 0.15s',
            }}
          >
            Submit
          </button>
        </form>

        {/* Submission ack */}
        {ackMessage && (
          <div style={{
            padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
            background: ackCorrect ? '#14532d' : '#450a0a',
            color: ackCorrect ? '#86efac' : '#fca5a5',
            fontSize: '15px', fontWeight: '500',
          }}>
            {ackMessage}
          </div>
        )}

        {/* Round ended */}
        {roundEndInfo && (
          <div style={{
            padding: '16px 20px', borderRadius: '8px', marginBottom: '16px',
            background: '#1e293b', border: '1px solid #334155',
          }}>
            {roundEndInfo.reason === 'winner_found' ? (
              <>
                <p style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#fbbf24' }}>
                  🏆 {roundEndInfo.winnerName} won the round!
                </p>
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
                  Correct answer: <strong style={{ color: '#f1f5f9' }}>{roundEndInfo.correctAnswer}</strong>
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#94a3b8' }}>
                  ⏱ Time's up — no winner this round
                </p>
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
                  Correct answer: <strong style={{ color: '#f1f5f9' }}>{roundEndInfo.correctAnswer}</strong>
                </p>
              </>
            )}
          </div>
        )}

        {/* Next round countdown */}
        {countdown !== null && roundState === 'countdown' && (
          <div style={{ textAlign: 'center', padding: '12px', color: '#60a5fa', fontSize: '15px', fontWeight: '500' }}>
            Next round in {countdown}s…
          </div>
        )}

        <Leaderboard socket={socket} />
      </div>
    </div>
  )
}
