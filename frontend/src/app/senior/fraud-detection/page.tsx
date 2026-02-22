'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface ScamSignal {
  name: string
  detected: boolean
  description: string
}

interface ScamResult {
  label: 'SCAM' | 'SAFE'
  confidence: number
  confidence_pct: string
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  signals: ScamSignal[]
  summary: string
  analyzed_at: string
}

const ML_API = process.env.NEXT_PUBLIC_ML_URL || 'http://localhost:8001'

export default function FraudDetectionPage() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const [emailAddress, setEmailAddress] = useState('')
  const [emailBody,    setEmailBody]    = useState('')
  const [smsContent,   setSmsContent]   = useState('')
  const [phoneNumber,  setPhoneNumber]  = useState('')
  const [result,       setResult]       = useState<ScamResult | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    if (user && user.role !== 'SENIOR') router.push('/family')
  }, [user, router])

  const hasInput = emailAddress || emailBody || smsContent || phoneNumber

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasInput) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${ML_API}/detect-scam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_address: emailAddress || null,
          email_body:    emailBody    || null,
          sms_content:   smsContent   || null,
          phone_number:  phoneNumber  || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Detection failed')
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reach detection service.')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setEmailAddress('')
    setEmailBody('')
    setSmsContent('')
    setPhoneNumber('')
    setResult(null)
    setError(null)
  }

  const riskColor = (level: string) => ({
    LOW:      'text-green-600',
    MEDIUM:   'text-yellow-600',
    HIGH:     'text-orange-600',
    CRITICAL: 'text-red-600',
  }[level] || 'text-gray-600')

  const riskBg = (level: string) => ({
    LOW:      'bg-green-50 border-green-200',
    MEDIUM:   'bg-yellow-50 border-yellow-200',
    HIGH:     'bg-orange-50 border-orange-200',
    CRITICAL: 'bg-red-50 border-red-200',
  }[level] || 'bg-gray-50 border-gray-200')

  const riskBar = (level: string) => ({
    LOW:      'bg-green-500',
    MEDIUM:   'bg-yellow-500',
    HIGH:     'bg-orange-500',
    CRITICAL: 'bg-red-600',
  }[level] || 'bg-gray-400')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — matches senior dashboard blue style */}
      <header className="bg-blue-800 text-white px-6 py-5 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔍</span>
            <div>
              <h1 className="text-xl font-bold">Fraud Detection</h1>
              <p className="text-blue-200 text-sm">Check if a message or contact is a scam · {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/senior')} className="text-blue-200 hover:text-white text-sm">
              ← Back to Dashboard
            </button>
            <button onClick={logout} className="text-blue-200 hover:text-white text-sm">Sign Out</button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Info banner */}
        <div className="card flex items-start gap-3">
          <span className="text-2xl mt-0.5">💡</span>
          <div>
            <p className="font-semibold text-gray-800">Got a suspicious email, text, or call?</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Paste any combination of details below and our AI will check it for scam patterns.
              Nothing is required — fill in whatever you have.
            </p>
          </div>
        </div>

        <div className="flex gap-5">
          {/* Form */}
          <div className="flex-1">
            <div className="card space-y-4">
              <h2 className="font-bold text-gray-800 text-base">What looks suspicious?</h2>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Sender Email Address
                </label>
                <input
                  type="text"
                  value={emailAddress}
                  onChange={e => setEmailAddress(e.target.value)}
                  placeholder="e.g. noreply@paypa1-secure.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Email Content
                </label>
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  placeholder="Paste the email message here..."
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Text Message (SMS)
                </label>
                <textarea
                  value={smsContent}
                  onChange={e => setSmsContent(e.target.value)}
                  placeholder="Paste the text message here..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="e.g. 1-800-555-0199"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSubmit}
                  disabled={!hasInput || loading}
                  className="flex-1 py-2.5 px-6 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin">🔍</span>
                      Analyzing...
                    </>
                  ) : '🔍 Check for Scams'}
                </button>
                {(hasInput || result) && (
                  <button
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Result panel */}
          <div className="w-80 flex-shrink-0 space-y-4">
            {!result && !error && !loading && (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3">🛡️</div>
                <p className="font-semibold text-gray-700">Results will appear here</p>
                <p className="text-sm text-gray-400 mt-1">Fill in the form and click Analyze</p>
              </div>
            )}

            {loading && (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3 animate-spin">🔍</div>
                <p className="font-semibold text-gray-700">Analyzing...</p>
                <p className="text-sm text-gray-400 mt-1">Running scam detection model</p>
              </div>
            )}

            {error && (
              <div className="card border-2 border-red-200 bg-red-50">
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-red-700 text-sm">Detection failed</p>
                    <p className="text-sm text-red-600 mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className={`card border-2 ${riskBg(result.risk_level)} space-y-4`}>
                {/* Verdict */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">
                      {result.label === 'SCAM' ? '🚨' : '✅'}
                    </span>
                    <div>
                      <p className={`text-xl font-bold ${result.label === 'SCAM' ? 'text-red-700' : 'text-green-700'}`}>
                        {result.label === 'SCAM' ? 'Likely Scam' : 'Looks Safe'}
                      </p>
                      <p className={`text-xs font-semibold ${riskColor(result.risk_level)}`}>
                        {result.risk_level} RISK
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{result.confidence_pct}</p>
                    <p className="text-xs text-gray-500">confidence</p>
                  </div>
                </div>

                {/* Confidence bar */}
                <div className="w-full bg-white/70 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-700 ${riskBar(result.risk_level)}`}
                    style={{ width: `${result.confidence * 100}%` }}
                  />
                </div>

                {/* Summary */}
                <p className="text-sm text-gray-700">{result.summary}</p>

                {/* Signals */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Detection Signals
                  </p>
                  <div className="space-y-1.5">
                    {result.signals.map(signal => (
                      <div
                        key={signal.name}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                          signal.detected
                            ? 'bg-white border border-red-200'
                            : 'bg-white/40 border border-gray-100 opacity-50'
                        }`}
                      >
                        <span className="mt-0.5">{signal.detected ? '🔴' : '⚪'}</span>
                        <div>
                          <p className={`font-semibold ${signal.detected ? 'text-gray-900' : 'text-gray-400'}`}>
                            {signal.name}
                          </p>
                          <p className="text-gray-500">{signal.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Safety tip */}
            <div className="card bg-blue-50 border border-blue-100">
              <p className="text-xs font-bold text-blue-700 mb-1">🛡️ Stay Safe</p>
              <p className="text-xs text-blue-600">
                Never click links in suspicious messages or share your Social Security number, bank details, or passwords with anyone who contacts you unexpectedly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}