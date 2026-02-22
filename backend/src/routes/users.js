// routes/users.js
import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireSenior } from '../middleware/auth.js'

const router = Router()

// Update protection settings (senior only)
router.patch('/settings', authenticate, requireSenior, async (req, res, next) => {
  try {
    const { protectionMode, riskThreshold, name, phone } = req.body
    const data = {}
    if (typeof protectionMode === 'boolean') data.protectionMode = protectionMode
    if (typeof riskThreshold === 'number')   data.riskThreshold  = riskThreshold
    if (name)  data.name  = name
    if (phone) data.phone = phone

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, name: true, email: true, role: true, protectionMode: true, riskThreshold: true, phone: true }
    })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

export default router
