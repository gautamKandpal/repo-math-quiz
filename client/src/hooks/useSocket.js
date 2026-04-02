import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

export default function useSocket(token) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!token) {
      return
    }

    const socket = io({
      auth: { token },
    })

    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [token])

  return { socket: socketRef.current, connected }
}
