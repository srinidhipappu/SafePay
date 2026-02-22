// lib/gemini.js - Gemini AI explainability service
// Generates plain-language fraud explanations for seniors + family

import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI = null

function getClient() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return genAI
}

/**
 * Generate a plain-language explanation for a flagged transaction.
 * Returns { summary, reasons[], action }
 */
export async function explainTransaction(promptContext) {
  const client = getClient()

  if (!client) {
    console.warn('⚠️  No Gemini API key — using fallback explanation')
    return buildFallbackExplanation(promptContext)
  }

  try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `You are a fraud protection assistant for senior citizens. 
Analyze this flagged transaction and explain it in simple, clear language a senior would understand.

${promptContext.prompt_template}

IMPORTANT:
- Write as if speaking directly to the senior
- Be warm and non-alarmist but clear about the risk
- Keep summary under 2 sentences
- Give 2-4 specific reasons
- Action should be a clear instruction

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "summary": "string",
  "reasons": ["string", "string"],
  "action": "string"
}`

    const result  = await model.generateContent(prompt)
    const text    = result.response.text().trim()

    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    // Validate shape
    if (!parsed.summary || !Array.isArray(parsed.reasons) || !parsed.action) {
      throw new Error('Invalid Gemini response shape')
    }

    return parsed
  } catch (err) {
    console.error('⚠️  Gemini error:', err.message)
    return buildFallbackExplanation(promptContext)
  }
}

/**
 * Fallback explanation when Gemini is unavailable
 * Uses the risk flags to build a template response
 */
function buildFallbackExplanation(ctx) {
  const { transaction, risk, user_baseline } = ctx || {}

  const amount  = transaction?.amount   ?? 0
  const merchant = transaction?.merchant ?? 'Unknown merchant'
  const flags   = risk?.flags ?? []
  const ratio   = user_baseline?.amount_ratio ?? 1

  const reasons = []

  if (flags.includes('LARGE_AMOUNT')) {
    reasons.push(`This purchase ($${amount.toFixed(2)}) is ${ratio.toFixed(1)}x larger than your typical spending`)
  }
  if (flags.includes('HIGH_RISK_CATEGORY')) {
    reasons.push('This merchant type (gift cards or financial transfers) is commonly used in scams targeting seniors')
  }
  if (flags.includes('NEW_LOCATION')) {
    reasons.push(`This transaction is from an unfamiliar location: ${transaction?.city}`)
  }
  if (flags.includes('NEW_MERCHANT')) {
    reasons.push(`You have not shopped at "${merchant}" before`)
  }
  if (flags.includes('UNUSUAL_TIME')) {
    reasons.push('This transaction occurred at an unusual hour for your spending pattern')
  }
  if (flags.includes('HIGH_VELOCITY')) {
    reasons.push('Multiple transactions occurred in a short time period')
  }

  if (reasons.length === 0) {
    reasons.push('This transaction looks different from your normal spending patterns')
  }

  const riskLevel = risk?.level ?? 'HIGH'
  const action    = riskLevel === 'CRITICAL'
    ? 'Please contact your bank immediately if you did not make this purchase.'
    : 'Please review this transaction and confirm whether you made this purchase.'

  return {
    summary: `We flagged a ${riskLevel.toLowerCase()}-risk transaction of $${amount.toFixed(2)} at ${merchant}. Please review it carefully.`,
    reasons,
    action,
    usedFallback: true,
  }
}
