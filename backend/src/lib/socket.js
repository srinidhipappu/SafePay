// lib/socket.js - Real-time WebSocket management
// Rooms: user:{userId} — each user joins their own room on connect

import jwt from 'jsonwebtoken'

// Map userId → Set of socket IDs (for tracking connections)
const userSockets = new Map()

export function setupSocketHandlers(io) {
  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('No token'))

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      socket.userId = decoded.userId
      socket.userRole = decoded.role
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.userId
    console.log(`🔌 Socket connected: user=${userId}`)

    // Join personal room
    socket.join(`user:${userId}`)

    // Track connections
    if (!userSockets.has(userId)) userSockets.set(userId, new Set())
    userSockets.get(userId).add(socket.id)

    // Family member: join rooms for all their seniors
    socket.on('join:senior', (seniorId) => {
      socket.join(`user:${seniorId}`)
      console.log(`   Family ${userId} watching senior ${seniorId}`)
    })

    socket.on('disconnect', () => {
      userSockets.get(userId)?.delete(socket.id)
      console.log(`🔌 Socket disconnected: user=${userId}`)
    })
  })
}

// ─── Emit helpers (called from route handlers) ────────────────────────────────

/**
 * Notify a user (and any family watching them) of a new alert
 */
export function emitNewAlert(io, seniorId, alertData) {
  io.to(`user:${seniorId}`).emit('alert:new', alertData)
}

/**
 * Notify that an alert's status changed (approved/denied)
 */
export function emitAlertUpdate(io, seniorId, alertData) {
  io.to(`user:${seniorId}`).emit('alert:update', alertData)
}

/**
 * Notify a specific user
 */
export function emitToUser(io, userId, event, data) {
  io.to(`user:${userId}`).emit(event, data)
}
