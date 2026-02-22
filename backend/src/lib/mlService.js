// lib/mlService.js - Client for Python ML scoring service

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001'

/**
 * Score a transaction using the Python ML service.
 * Returns full risk assessment with flags and Gemini prompt context.
 */
export async function scoreTransaction(txn) {
  try {
    const response = await fetch(`${ML_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: txn.id,
        user_id:        txn.userId,
        amount:         txn.amount,
        merchant:       txn.merchant,
        mcc:            txn.mcc,
        timestamp:      txn.timestamp.toISOString(),
        city:           txn.city,
        device_id:      txn.deviceId,
      }),
      signal: AbortSignal.timeout(8000), // 8s timeout
    })

    if (!response.ok) {
      throw new Error(`ML service error: ${response.status}`)
    }

    return await response.json()
  } catch (err) {
    console.error('⚠️  ML service unavailable:', err.message)
    // Return a default medium-risk score so app still works without ML
    return {
      risk_score:       0.35,
      risk_level:       'MEDIUM',
      anomaly_score:    0.35,
      fraud_probability: 0.35,
      risk_flags:       [],
      gemini_prompt_context: null,
    }
  }
}

/**
 * Get a user's behavioral baseline
 */
export async function getUserBaseline(userId) {
  try {
    const res = await fetch(`${ML_URL}/users/${userId}/baseline`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
