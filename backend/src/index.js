// SafePay Family - Backend Server
// Express + Socket.io + Prisma

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'

import authRoutes       from './routes/auth.js'
import transactionRoutes from './routes/transactions.js'
import alertRoutes      from './routes/alerts.js'
import trustedRoutes    from './routes/trusted.js'
import userRoutes       from './routes/users.js'
import { setupSocketHandlers } from './lib/socket.js'

dotenv.config()

const app    = express()
const server = createServer(app)

// ─── Socket.io ───────────────────────────────────────────────────────────────
export const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  }
})

setupSocketHandlers(io)

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())

// Request logger (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`)
    next()
  })
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/alerts',       alertRoutes)
app.use('/api/trusted',      trustedRoutes)
app.use('/api/users',        userRoutes)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Error:', err.message)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  })
})

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
  console.log(`\n🛡️  SafePay Backend running on port ${PORT}`)
  console.log(`   ML Service: ${process.env.ML_SERVICE_URL}`)
  console.log(`   Environment: ${process.env.NODE_ENV}\n`)
})
