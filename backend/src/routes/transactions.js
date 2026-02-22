// routes/transactions.js
// Core pipeline: receive txn → ML score → alert if risky → Gemini explain → notify

import { Router } from 'express'
import { prisma }      from '../lib/prisma.js'
import { authenticate, requireSenior } from '../middleware/auth.js'
import { scoreTransaction }  from '../lib/mlService.js'
import { explainTransaction } from '../lib/gemini.js'
import { io }                from '../index.js'
import { emitNewAlert }      from '../lib/socket.js'

const router = Router()

// ─── POST /api/transactions ───────────────────────────────────────────────────
// Submit a new transaction. Triggers full ML + alert pipeline.
router.post('/', authenticate, requireSenior, async (req, res, next) => {
  try {
    const { amount, merchant, mcc, mccDesc, city, deviceId } = req.body

    // 1. Save transaction
    const txn = await prisma.transaction.create({
      data: {
        userId:    req.user.id,
        amount:    parseFloat(amount),
        merchant,
        mcc,
        mccDesc:   mccDesc || 'Unknown',
        city,
        deviceId:  deviceId || null,
        timestamp: new Date(),
      }
    })

    // 2. Score with ML service (async, don't block response)
    const riskResult = await scoreTransaction(txn)

    // 3. Update transaction with risk data
    const scored = await prisma.transaction.update({
      where: { id: txn.id },
      data: {
        riskScore:        riskResult.risk_score,
        riskLevel:        riskResult.risk_level,
        anomalyScore:     riskResult.anomaly_score,
        fraudProbability: riskResult.fraud_probability,
        riskFlags:        riskResult.risk_flags || [],
        scoredAt:         new Date(),
      }
    })

    // 4. If risky → create alert + Gemini explanation
    let alert = null
    const threshold = 0.3 // create alert for MEDIUM+

    if (riskResult.risk_score >= threshold) {
      // Get Gemini explanation
      const explanation = await explainTransaction(riskResult.gemini_prompt_context)

      // Create alert
      alert = await prisma.alert.create({
        data: {
          seniorId:      req.user.id,
          transactionId: txn.id,
          aiSummary:     explanation.summary,
          aiReasons:     explanation.reasons,
          aiAction:      explanation.action,
          usedFallback:  explanation.usedFallback || false,
        },
        include: {
          transaction: true,
        }
      })

      // 5. Real-time notify via Socket.io
      // Notify senior + all family members watching them
      const trustedLinks = await prisma.trustedLink.findMany({
        where: { seniorId: req.user.id, status: 'ACTIVE' },
        include: { family: { select: { id: true, name: true } } }
      })

      const alertPayload = {
        ...alert,
        seniorName: req.user.name,
        familyMembers: trustedLinks.map(l => l.family),
      }

      // Emit to senior
      io.to(`user:${req.user.id}`).emit('alert:new', alertPayload)

      // Emit to each family member
      for (const link of trustedLinks) {
        io.to(`user:${link.familyId}`).emit('alert:new', alertPayload)
      }

      console.log(`🚨 Alert created: ${alert.id} (${riskResult.risk_level})`)
    }

    res.status(201).json({
      transaction: scored,
      alert,
      riskLevel: riskResult.risk_level,
      riskScore: riskResult.risk_score,
    })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/transactions ────────────────────────────────────────────────────
// Get transactions for logged-in senior, or their linked senior (family)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { limit = 20, offset = 0, seniorId } = req.query

    let targetUserId = req.user.id

    if (req.user.role === 'FAMILY' && seniorId) {
      // Verify trusted link
      const link = await prisma.trustedLink.findFirst({
        where: { seniorId, familyId: req.user.id, status: 'ACTIVE' }
      })
      if (!link) return res.status(403).json({ error: 'Not in trusted circle' })
      targetUserId = seniorId
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where:   { userId: targetUserId },
        orderBy: { timestamp: 'desc' },
        take:    parseInt(limit),
        skip:    parseInt(offset),
        include: { alert: { select: { id: true, status: true } } }
      }),
      prisma.transaction.count({ where: { userId: targetUserId } })
    ])

    res.json({ transactions, total, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/transactions/stats ──────────────────────────────────────────────
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const { seniorId } = req.query
    let targetUserId = req.user.id

    if (req.user.role === 'FAMILY' && seniorId) {
      const link = await prisma.trustedLink.findFirst({
        where: { seniorId, familyId: req.user.id, status: 'ACTIVE' }
      })
      if (!link) return res.status(403).json({ error: 'Not in trusted circle' })
      targetUserId = seniorId
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [all, monthly, risky, caught] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId: targetUserId },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { userId: targetUserId, timestamp: { gte: thirtyDaysAgo } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.count({
        where: { userId: targetUserId, riskLevel: { in: ['HIGH', 'CRITICAL'] } }
      }),
      prisma.alert.count({
        where: { seniorId: targetUserId, status: 'DENIED' }
      }),
    ])

    // Spending by category (last 30 days)
    const byCategory = await prisma.transaction.groupBy({
      by: ['mccDesc'],
      where: { userId: targetUserId, timestamp: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 6,
    })

    // Daily spending (last 14 days)
    const recent = await prisma.transaction.findMany({
      where: { userId: targetUserId, timestamp: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
      select: { amount: true, timestamp: true, riskLevel: true },
      orderBy: { timestamp: 'asc' },
    })

    res.json({
      totalSpend:     all._sum.amount || 0,
      totalCount:     all._count,
      monthlySpend:   monthly._sum.amount || 0,
      monthlyCount:   monthly._count,
      riskyCount:     risky,
      caughtFraud:    caught,
      byCategory:     byCategory.map(c => ({
        name: c.mccDesc,
        amount: c._sum.amount || 0,
        count: c._count,
      })),
      recentActivity: recent,
    })
  } catch (err) {
    next(err)
  }
})

export default router
