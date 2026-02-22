'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, Transaction, Alert, Stats } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { useSocket } from '@/hooks/useSocket'
import { AlertCard } from '@/components/AlertCard'
import { RiskBadge } from '@/components/RiskBadge'
import { SpendingChart } from '@/components/SpendingChart'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

export default function SeniorDashboard() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const [alerts, setAlerts]           = useState<Alert[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stats, setStats]             = useState<Stats | null>(null)
  const [loading, setLoading]         = useState(true)
  const [deciding, setDeciding]       = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<'alerts' | 'transactions' | 'circle'>('alerts')

  // ── New transaction form state ──
  const [showTxnForm, setShowTxnForm] = useState(false)
  const [txnForm, setTxnForm] = useState({
    amount: '', merchant: '', mcc: '5411', mccDesc: 'Grocery Stores', city: 'Tampa'
  })
  const [txnLoading, setTxnLoading] = useState(false)
  const [txnResult, setTxnResult]   = useState<any>(null)

  const loadData = useCallback(async () => {
    try {
      const [alertRes, txnRes, statsRes] = await Promise.all([
        api.alerts.list({ status: 'PENDING', limit: '10' }),
        api.transactions.list({ limit: '15' }),
        api.transactions.stats(),
      ])
      setAlerts(alertRes.alerts)
      setTransactions(txnRes.transactions)
      setStats(statsRes)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'SENIOR') { router.push('/login'); return }
    loadData()
  }, [user, loadData])

  // Real-time alerts
  const handleAlert = useCallback((alert: Alert) => {
    setAlerts(prev => {
      const exists = prev.find(a => a.id === alert.id)
      if (exists) return prev.map(a => a.id === alert.id ? alert : a)
      return [alert, ...prev]
    })
    setNotification(`🚨 New alert: ${alert.transaction?.merchant} — $${alert.transaction?.amount}`)
    setTimeout(() => setNotification(null), 5000)
    loadData()
  }, [loadData])

  useSocket(user?.id, handleAlert)

  const decide = async (alertId: string, decision: 'APPROVED' | 'DENIED') => {
    setDeciding(true)
    try {
      await api.alerts.decide(alertId, decision)
      setAlerts(prev => prev.filter(a => a.id !== alertId))
      setNotification(decision === 'APPROVED' ? '✅ Transaction approved' : '🚫 Transaction blocked')
      setTimeout(() => setNotification(null), 4000)
      loadData()
    } catch (err: any) {
      setNotification(`Error: ${err.message}`)
    } finally {
      setDeciding(false)
    }
  }

  const submitTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setTxnLoading(true)
    setTxnResult(null)
    try {
      const result = await api.transactions.create({
        amount: parseFloat(txnForm.amount),
        merchant: txnForm.merchant,
        mcc: txnForm.mcc,
        mccDesc: txnForm.mccDesc,
        city: txnForm.city,
      })
      setTxnResult(result)
      loadData()
    } catch (err: any) {
      setTxnResult({ error: err.message })
    } finally {
      setTxnLoading(false)
    }
  }

  const pendingCount = alerts.filter(a => a.status === 'PENDING').length

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">🛡️</div>
        <p className="text-gray-500 text-lg">Loading your account...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notification toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-white border-2 border-blue-200 rounded-2xl shadow-lg px-6 py-4 text-base font-semibold text-gray-800 max-w-sm">
          {notification}
        </div>
      )}

      {/* Header */}
      <header className="bg-blue-800 text-white px-6 py-5 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h1 className="text-xl font-bold">SafePay Family</h1>
              <p className="text-blue-200 text-sm">Welcome, {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full animate-pulse">
                {pendingCount} Alert{pendingCount > 1 ? 's' : ''}
              </span>
            )}
            <button onClick={() => setShowTxnForm(true)}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              + Test Transaction
            </button>
            <button onClick={logout} className="text-blue-200 hover:text-white text-sm">Sign Out</button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Account Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card text-center">
            <p className="text-3xl font-bold text-blue-800">${user?.accountBalance?.toLocaleString()}</p>
            <p className="text-gray-500 text-sm mt-1">Account Balance</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-gray-800">${stats?.monthlySpend?.toFixed(0)}</p>
            <p className="text-gray-500 text-sm mt-1">This Month</p>
          </div>
          <div className="card text-center">
            <p className={`text-3xl font-bold ${pendingCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {pendingCount}
            </p>
            <p className="text-gray-500 text-sm mt-1">Pending Alerts</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-green-700">{stats?.caughtFraud ?? 0}</p>
            <p className="text-gray-500 text-sm mt-1">Fraud Blocked</p>
          </div>
        </div>

        {/* Charts */}
        {stats && <SpendingChart stats={stats} />}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['alerts', 'transactions', 'circle'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 font-semibold text-sm rounded-t-xl capitalize transition-colors
                ${activeTab === tab
                  ? 'bg-white text-blue-700 border-b-2 border-blue-700'
                  : 'text-gray-500 hover:text-gray-700'}`}>
              {tab === 'alerts' && pendingCount > 0 ? `🚨 Alerts (${pendingCount})` : 
               tab === 'alerts' ? 'Alerts' :
               tab === 'transactions' ? 'Transactions' : 'Trusted Circle'}
            </button>
          ))}
        </div>

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-xl font-semibold text-gray-700">No pending alerts</p>
                <p className="text-gray-400 mt-1">Your recent transactions look normal</p>
              </div>
            ) : (
              alerts.map(alert => (
                <AlertCard key={alert.id} alert={alert} onDecide={decide} deciding={deciding} />
              ))
            )}
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="card overflow-hidden p-0">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Recent Transactions</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {transactions.map(txn => (
                <div key={txn.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                  <div>
                    <p className="font-semibold text-gray-900">{txn.merchant}</p>
                    <p className="text-sm text-gray-500">
                      {txn.city} · {formatDistanceToNow(new Date(txn.timestamp))} ago
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <RiskBadge level={txn.riskLevel} />
                    <p className="font-bold text-gray-900 text-lg">${txn.amount.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trusted Circle Tab */}
        {activeTab === 'circle' && <TrustedCirclePanel />}
      </div>

      {/* Test Transaction Modal */}
      {showTxnForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-5">Simulate Transaction</h3>
            <form onSubmit={submitTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Amount ($)</label>
                <input value={txnForm.amount} onChange={e => setTxnForm({...txnForm, amount: e.target.value})}
                  className="input" placeholder="e.g. 850.00" required type="number" step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Merchant</label>
                <input value={txnForm.merchant} onChange={e => setTxnForm({...txnForm, merchant: e.target.value})}
                  className="input" placeholder="e.g. CoinFlip ATM" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                  <select value={txnForm.mcc} onChange={e => {
                    const opts: Record<string, string> = {
                      '5411': 'Grocery Stores', '5912': 'Drug Stores', '5812': 'Eating Places',
                      '6051': 'Gift Cards/Crypto', '6012': 'Wire Transfer', '7995': 'Gambling'
                    }
                    setTxnForm({...txnForm, mcc: e.target.value, mccDesc: opts[e.target.value] || 'Other'})
                  }} className="input">
                    <option value="5411">Grocery</option>
                    <option value="5912">Pharmacy</option>
                    <option value="5812">Restaurant</option>
                    <option value="6051">Gift Card/Crypto ⚠️</option>
                    <option value="6012">Wire Transfer ⚠️</option>
                    <option value="7995">Gambling ⚠️</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">City</label>
                  <input value={txnForm.city} onChange={e => setTxnForm({...txnForm, city: e.target.value})}
                    className="input" placeholder="Tampa" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={txnLoading} className="btn-primary flex-1">
                  {txnLoading ? '⏳ Scoring...' : '🔍 Submit & Score'}
                </button>
                <button type="button" onClick={() => { setShowTxnForm(false); setTxnResult(null) }}
                  className="btn-outline">Cancel</button>
              </div>
            </form>

            {txnResult && !txnResult.error && (
              <div className={`mt-4 p-4 rounded-xl border-2 ${
                txnResult.riskLevel === 'CRITICAL' ? 'bg-red-50 border-red-300' :
                txnResult.riskLevel === 'HIGH' ? 'bg-orange-50 border-orange-300' :
                'bg-green-50 border-green-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-900">Risk Assessment</span>
                  <RiskBadge level={txnResult.riskLevel} />
                </div>
                <p className="text-sm text-gray-700">Score: <strong>{(txnResult.riskScore * 100).toFixed(0)}%</strong></p>
                {txnResult.alert && (
                  <p className="text-sm text-red-700 mt-1 font-semibold">🚨 Alert created — check your alerts tab</p>
                )}
              </div>
            )}
            {txnResult?.error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {txnResult.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Trusted Circle sub-panel ─────────────────────────────────────────────────
function TrustedCirclePanel() {
  const [links, setLinks]     = useState<any[]>([])
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api.trusted.list().then(setLinks).catch(console.error)
  }, [])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess('')
    try {
      const link = await api.trusted.invite(email)
      setLinks(prev => [...prev, link])
      setSuccess(`✅ ${link.family?.name} added to your trusted circle`)
      setEmail('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const remove = async (familyId: string) => {
    await api.trusted.remove(familyId)
    setLinks(prev => prev.filter(l => l.familyId !== familyId))
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold text-lg mb-4">Your Trusted Family Circle</h3>
        <p className="text-gray-500 text-sm mb-4">
          These family members can see your alerts and help you review suspicious transactions.
        </p>

        {error   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-3 text-sm">{success}</div>}

        <form onSubmit={invite} className="flex gap-3 mb-6">
          <input value={email} onChange={e => setEmail(e.target.value)} type="email"
            className="input flex-1" placeholder="family@example.com" required />
          <button type="submit" disabled={loading} className="btn-primary whitespace-nowrap">
            {loading ? 'Adding...' : '+ Add Member'}
          </button>
        </form>

        <div className="space-y-3">
          {links.length === 0 ? (
            <p className="text-gray-400 text-center py-6">No family members added yet</p>
          ) : links.map(link => (
            <div key={link.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <div>
                <p className="font-semibold text-gray-900">{link.family?.name}</p>
                <p className="text-sm text-gray-500">{link.family?.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  link.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>{link.status}</span>
                <button onClick={() => remove(link.familyId)}
                  className="text-red-500 hover:text-red-700 text-sm font-semibold">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
