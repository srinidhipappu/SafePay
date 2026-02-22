// middleware/auth.js - JWT authentication + role guards

import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true, protectionMode: true }
    })

    if (!user) return res.status(401).json({ error: 'User not found' })

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Only SENIOR role
export const requireSenior = (req, res, next) => {
  if (req.user?.role !== 'SENIOR') {
    return res.status(403).json({ error: 'Senior access only' })
  }
  next()
}

// Only FAMILY role
export const requireFamily = (req, res, next) => {
  if (req.user?.role !== 'FAMILY') {
    return res.status(403).json({ error: 'Family access only' })
  }
  next()
}

// Either role, but family must have trusted link to senior
export const requireTrustedAccess = (seniorIdParam = 'seniorId') => async (req, res, next) => {
  const seniorId = req.params[seniorIdParam] || req.query[seniorIdParam]

  if (req.user.role === 'SENIOR') {
    if (req.user.id !== seniorId) {
      return res.status(403).json({ error: 'Access denied' })
    }
    return next()
  }

  if (req.user.role === 'FAMILY') {
    const link = await prisma.trustedLink.findFirst({
      where: { seniorId, familyId: req.user.id, status: 'ACTIVE' }
    })
    if (!link) return res.status(403).json({ error: 'Not in trusted circle' })
    return next()
  }

  res.status(403).json({ error: 'Access denied' })
}
