// routes/trusted.js - Trusted Circle management

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireSenior } from '../middleware/auth.js'

const router = Router()

// ─── GET /api/trusted ─────────────────────────────────────────────────────────
// Senior: get their family circle. Family: get their linked seniors.
router.get('/', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'SENIOR') {
      const links = await prisma.trustedLink.findMany({
        where: { seniorId: req.user.id },
        include: { family: { select: { id: true, name: true, email: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' }
      })
      return res.json(links)
    }

    if (req.user.role === 'FAMILY') {
      const links = await prisma.trustedLink.findMany({
        where: { familyId: req.user.id },
        include: { senior: { select: { id: true, name: true, email: true, accountBalance: true } } },
        orderBy: { createdAt: 'desc' }
      })
      return res.json(links)
    }
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/trusted/invite ─────────────────────────────────────────────────
// Senior invites a family member by email
router.post('/invite', authenticate, requireSenior, async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'email is required' })

    const familyUser = await prisma.user.findUnique({ where: { email } })
    if (!familyUser) return res.status(404).json({ error: 'No user found with that email' })
    if (familyUser.role !== 'FAMILY') {
      return res.status(400).json({ error: 'That user is not a family member account' })
    }
    if (familyUser.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot invite yourself' })
    }

    // Check if link already exists
    const existing = await prisma.trustedLink.findFirst({
      where: { seniorId: req.user.id, familyId: familyUser.id }
    })

    if (existing) {
      if (existing.status === 'ACTIVE') return res.status(409).json({ error: 'Already in trusted circle' })
      // Re-activate if revoked
      const updated = await prisma.trustedLink.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE' },
        include: { family: { select: { id: true, name: true, email: true } } }
      })
      return res.json(updated)
    }

    const link = await prisma.trustedLink.create({
      data: { seniorId: req.user.id, familyId: familyUser.id, status: 'ACTIVE' },
      include: { family: { select: { id: true, name: true, email: true } } }
    })

    res.status(201).json(link)
  } catch (err) {
    next(err)
  }
})

// ─── DELETE /api/trusted/:familyId ───────────────────────────────────────────
router.delete('/:familyId', authenticate, requireSenior, async (req, res, next) => {
  try {
    const link = await prisma.trustedLink.findFirst({
      where: { seniorId: req.user.id, familyId: req.params.familyId }
    })
    if (!link) return res.status(404).json({ error: 'Link not found' })

    await prisma.trustedLink.update({
      where: { id: link.id },
      data: { status: 'REVOKED' }
    })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
