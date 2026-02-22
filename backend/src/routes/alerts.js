// routes/alerts.js - Alert management + approval workflow

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { io } from '../index.js'

const router = Router()

// ─── GET /api/alerts ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, seniorId, limit = 20, offset = 0 } = req.query

    let where = {}

    if (req.user.role === 'SENIOR') {
      where.seniorId = req.user.id
    } else if (req.user.role === 'FAMILY') {
      // Family sees alerts for all their linked seniors
      if (seniorId) {
        const link = await prisma.trustedLink.findFirst({
          where: { seniorId, familyId: req.user.id, status: 'ACTIVE' }
        })
        if (!link) return res.status(403).json({ error: 'Not in trusted circle' })
        where.seniorId = seniorId
      } else {
        const links = await prisma.trustedLink.findMany({
          where: { familyId: req.user.id, status: 'ACTIVE' }
        })
        where.seniorId = { in: links.map(l => l.seniorId) }
      }
    }

    if (status) where.status = status

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          transaction: true,
          senior: { select: { id: true, name: true, email: true } },
          approvals: {
            include: { user: { select: { id: true, name: true, role: true } } }
          }
        }
      }),
      prisma.alert.count({ where })
    ])

    res.json({ alerts, total })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/alerts/:id ──────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: {
        transaction: true,
        senior: { select: { id: true, name: true, email: true } },
        approvals: {
          include: { user: { select: { id: true, name: true, role: true } } }
        }
      }
    })

    if (!alert) return res.status(404).json({ error: 'Alert not found' })

    // Access check
    if (req.user.role === 'SENIOR' && alert.seniorId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    if (req.user.role === 'FAMILY') {
      const link = await prisma.trustedLink.findFirst({
        where: { seniorId: alert.seniorId, familyId: req.user.id, status: 'ACTIVE' }
      })
      if (!link) return res.status(403).json({ error: 'Not in trusted circle' })
    }

    res.json(alert)
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/alerts/:id/decide ─────────────────────────────────────────────
// Approve or deny an alert (both senior and family can do this)
router.post('/:id/decide', authenticate, async (req, res, next) => {
  try {
    const { decision, note } = req.body

    if (!['APPROVED', 'DENIED'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be APPROVED or DENIED' })
    }

    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: { transaction: true }
    })

    if (!alert) return res.status(404).json({ error: 'Alert not found' })
    if (alert.status !== 'PENDING') {
      return res.status(409).json({ error: `Alert already ${alert.status.toLowerCase()}` })
    }

    // Access check
    if (req.user.role === 'SENIOR' && alert.seniorId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    if (req.user.role === 'FAMILY') {
      const link = await prisma.trustedLink.findFirst({
        where: { seniorId: alert.seniorId, familyId: req.user.id, status: 'ACTIVE' }
      })
      if (!link) return res.status(403).json({ error: 'Not in trusted circle' })
    }

    // Record approval
    const approval = await prisma.approval.create({
      data: {
        alertId:  alert.id,
        userId:   req.user.id,
        decision,
        note,
      }
    })

    // Update alert status
    const updated = await prisma.alert.update({
      where: { id: alert.id },
      data: {
        status:     decision,
        resolvedAt: new Date(),
      },
      include: {
        transaction: true,
        senior: { select: { id: true, name: true } },
        approvals: { include: { user: { select: { id: true, name: true, role: true } } } }
      }
    })

    // Emit real-time update to senior + family
    io.to(`user:${alert.seniorId}`).emit('alert:update', updated)

    // Also notify all family watchers
    const links = await prisma.trustedLink.findMany({
      where: { seniorId: alert.seniorId, status: 'ACTIVE' }
    })
    for (const link of links) {
      io.to(`user:${link.familyId}`).emit('alert:update', updated)
    }

    console.log(`✅ Alert ${alert.id} ${decision} by ${req.user.name}`)
    res.json({ alert: updated, approval })
  } catch (err) {
    next(err)
  }
})

export default router
