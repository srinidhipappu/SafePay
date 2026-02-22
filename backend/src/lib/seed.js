// lib/seed.js - Seed demo data for hackathon presentation
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding SafePay demo data...')

  // Create senior user
  const senior = await prisma.user.upsert({
    where: { email: 'margaret@demo.com' },
    update: {},
    create: {
      email:        'margaret@demo.com',
      passwordHash: await bcrypt.hash('demo1234', 12),
      name:         'Margaret Johnson',
      role:         'SENIOR',
      accountBalance: 12450.00,
      protectionMode: true,
    }
  })

  // Create family user
  const family = await prisma.user.upsert({
    where: { email: 'sarah@demo.com' },
    update: {},
    create: {
      email:        'sarah@demo.com',
      passwordHash: await bcrypt.hash('demo1234', 12),
      name:         'Sarah Johnson',
      role:         'FAMILY',
    }
  })

  // Create trusted link
  await prisma.trustedLink.upsert({
    where: { seniorId_familyId: { seniorId: senior.id, familyId: family.id } },
    update: { status: 'ACTIVE' },
    create: { seniorId: senior.id, familyId: family.id, status: 'ACTIVE' }
  })

  // Create normal transactions
  const normalTxns = [
    { amount: 42.50,  merchant: 'Publix',         mcc: '5411', mccDesc: 'Grocery Stores',    city: 'Tampa', riskScore: 0.12, riskLevel: 'LOW' },
    { amount: 18.00,  merchant: 'CVS Pharmacy',    mcc: '5912', mccDesc: 'Drug Stores',        city: 'Tampa', riskScore: 0.08, riskLevel: 'LOW' },
    { amount: 65.00,  merchant: "Denny's",          mcc: '5812', mccDesc: 'Eating Places',      city: 'Tampa', riskScore: 0.15, riskLevel: 'LOW' },
    { amount: 35.00,  merchant: 'Shell Gas',        mcc: '5541', mccDesc: 'Gas Stations',       city: 'Tampa', riskScore: 0.10, riskLevel: 'LOW' },
    { amount: 120.00, merchant: 'Kohl\'s',          mcc: '5311', mccDesc: 'Department Stores',  city: 'Tampa', riskScore: 0.22, riskLevel: 'LOW' },
    { amount: 28.00,  merchant: 'IHOP',             mcc: '5812', mccDesc: 'Eating Places',      city: 'Tampa', riskScore: 0.11, riskLevel: 'LOW' },
    { amount: 15.00,  merchant: 'Walgreens',        mcc: '5912', mccDesc: 'Drug Stores',        city: 'Tampa', riskScore: 0.09, riskLevel: 'LOW' },
  ]

  for (const t of normalTxns) {
    const daysAgo = Math.floor(Math.random() * 14)
    await prisma.transaction.create({
      data: {
        userId: senior.id,
        amount: t.amount, merchant: t.merchant, mcc: t.mcc,
        mccDesc: t.mccDesc, city: t.city,
        riskScore: t.riskScore, riskLevel: t.riskLevel,
        anomalyScore: t.riskScore * 0.8,
        fraudProbability: t.riskScore * 0.3,
        riskFlags: [],
        scoredAt: new Date(),
        timestamp: new Date(Date.now() - daysAgo * 86400000 - Math.random() * 43200000),
      }
    })
  }

  // Create flagged/fraud transactions with alerts
  const fraudTxns = [
    {
      amount: 850.00, merchant: 'CoinFlip ATM', mcc: '6051',
      mccDesc: 'Gift Cards/Crypto', city: 'Unknown City',
      riskScore: 0.97, riskLevel: 'CRITICAL',
      riskFlags: [
        { flag: 'LARGE_AMOUNT', description: 'Transaction is 18.9x your usual spending', severity: 'high' },
        { flag: 'HIGH_RISK_CATEGORY', description: 'Gift Cards/Cryptocurrency — frequently used in scams', severity: 'high' },
        { flag: 'NEW_LOCATION', description: "Transaction in 'Unknown City'", severity: 'high' },
        { flag: 'UNUSUAL_TIME', description: 'Transaction at 2:00 AM', severity: 'medium' },
      ],
      summary: 'We detected a very high-risk transaction of $850 at a cryptocurrency ATM at 2 AM from an unknown location.',
      reasons: [
        'This purchase is 18.9x larger than your usual spending of ~$45',
        'Cryptocurrency ATMs are very commonly used in scams targeting seniors',
        'This transaction occurred in an unfamiliar location',
        'It happened at 2:00 AM, which is unusual for your spending pattern'
      ],
      action: 'Please contact your bank immediately if you did not make this purchase.',
      alertStatus: 'PENDING',
    },
    {
      amount: 500.00, merchant: 'Walmart Gift Card', mcc: '6051',
      mccDesc: 'Gift Cards/Crypto', city: 'Tampa',
      riskScore: 0.91, riskLevel: 'CRITICAL',
      riskFlags: [
        { flag: 'LARGE_AMOUNT', description: 'Transaction is 11.1x your usual spending', severity: 'high' },
        { flag: 'HIGH_RISK_CATEGORY', description: 'Gift cards are frequently used in scams', severity: 'high' },
      ],
      summary: 'A $500 gift card purchase was flagged — scammers frequently ask seniors to purchase gift cards.',
      reasons: [
        'This is 11x larger than your average purchase',
        'Gift cards are the #1 payment method in senior-targeting scams',
        'Legitimate organizations never ask you to pay with gift cards'
      ],
      action: 'If someone told you to buy this gift card, do not give them the code. This is likely a scam.',
      alertStatus: 'DENIED',
    },
  ]

  for (const t of fraudTxns) {
    const daysAgo = Math.floor(Math.random() * 7)
    const txn = await prisma.transaction.create({
      data: {
        userId: senior.id,
        amount: t.amount, merchant: t.merchant, mcc: t.mcc,
        mccDesc: t.mccDesc, city: t.city,
        riskScore: t.riskScore, riskLevel: t.riskLevel,
        anomalyScore: t.riskScore,
        fraudProbability: t.riskScore * 0.95,
        riskFlags: t.riskFlags,
        scoredAt: new Date(),
        timestamp: new Date(Date.now() - daysAgo * 86400000),
      }
    })

    const alert = await prisma.alert.create({
      data: {
        seniorId: senior.id, transactionId: txn.id,
        status: t.alertStatus,
        aiSummary: t.summary, aiReasons: t.reasons, aiAction: t.action,
        resolvedAt: t.alertStatus !== 'PENDING' ? new Date() : null,
      }
    })

    if (t.alertStatus === 'DENIED') {
      await prisma.approval.create({
        data: { alertId: alert.id, userId: family.id, decision: 'DENIED', note: 'Looks like a scam' }
      })
    }
  }

  console.log('\n✅ Demo data seeded!')
  console.log('   Senior:  margaret@demo.com / demo1234')
  console.log('   Family:  sarah@demo.com / demo1234')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
