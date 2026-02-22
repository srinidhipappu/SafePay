// hooks/useSocket.ts - Real-time socket connection

'use client'
import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000'

let globalSocket: Socket | null = null

export function useSocket(userId?: string, onAlert?: (alert: any) => void) {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!userId) return

    const token = localStorage.getItem('safepay_token')
    if (!token) return

    // Create socket if not exists
    if (!globalSocket) {
      globalSocket = io(SOCKET_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
      })
    }

    socketRef.current = globalSocket

    globalSocket.on('connect', () => {
      console.log('🔌 Connected to SafePay real-time')
    })

    if (onAlert) {
      globalSocket.on('alert:new', onAlert)
      globalSocket.on('alert:update', onAlert)
    }

    return () => {
      if (onAlert) {
        globalSocket?.off('alert:new', onAlert)
        globalSocket?.off('alert:update', onAlert)
      }
    }
  }, [userId, onAlert])

  const watchSenior = useCallback((seniorId: string) => {
    globalSocket?.emit('join:senior', seniorId)
  }, [])

  return { socket: socketRef.current, watchSenior }
}
