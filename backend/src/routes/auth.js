// routes/auth.js - Authentication endpoints

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' })
    }

    if (!['SENIOR', 'FAMILY'].includes(role)) {
      return res.status(400).json({ error: 'role must be SENIOR or FAMILY' })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { email, passwordHash, name, role },
      select: { id: true, email: true, name: true, role: true }
    })

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    res.status(201).json({ user, token })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    const { passwordHash, ...safeUser } = user
    res.json({ user: safeUser, token })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, role: true,
        phone: true, avatarUrl: true, accountBalance: true,
        protectionMode: true, riskThreshold: true, createdAt: true,
      }
    })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

export default router
