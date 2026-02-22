'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, Alert, Transaction, Stats, TrustedLink } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { useSocket } from '@/hooks/useSocket'
import { AlertCard } from '@/components/AlertCard'
import { SpendingChart } from '@/components/SpendingChart'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

export default function FamilyDashboard() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const [seniors, setSeniors]         = useState<TrustedLink[]>([])
  const [selectedSenior, setSelected] = useState<TrustedLink | null>(null)
  const [alerts, setAlerts]           = useState<Alert[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stats, setStats]             = useState<Stats | null>(null)
  const [loading, setLoading]         = useState(true)
  const [deciding, setDeciding]       = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<'alerts' | 'activity' | 'stats'>('alerts')

  useEffect(() => {
    if (user?.role !== 'FAMILY') { router.push('/login'); return }
    api.trusted.list().then((links: any[]) => {
      setSeniors(links)
      if (links.length > 0) setSelected(links[0])
      setLoading(false)
    }).catch(console.error)
  }, [user])

  const loadSeniorData = useCallback(async (seniorId: string) => {
    try {
      const [alertRes, txnRes, statsRes] = await Promise.all([
        api.alerts.list({ seniorId, limit: '20' }),
        api.transactions.list({ seniorId, limit: '20' }),
        api.transactions.stats(seniorId),
      ])
      setAlerts(alertRes.alerts)
      setTransactions(txnRes.transactions)
      setStats(statsRes)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    if (selectedSenior?.senior?.id) loadSeniorData(selectedSenior.senior.id)
  }, [selectedSenior, loadSeniorData])

  // Real-time: watch all linked seniors
  const handleAlert = useCallback((alert: Alert) => {
    setAlerts(prev => {
      const exists = prev.find(a => a.id === alert.id)
      if (exists) return prev.map(a => a.id === alert.id ? alert : a)
      return [alert, ...prev]
    })
    setNotification(`🚨 Alert for ${alert.senior?.name}: ${alert.transaction?.merchant} — $${alert.transaction?.amount}`)
    setTimeout(() => setNotification(null), 6000)
    if (selectedSenior?.senior?.id) loadSeniorData(selectedSenior.senior.id)
  }, [selectedSenior, loadSeniorData])

  const { watchSenior } = useSocket(user?.id, handleAlert)

  useEffect(() => {
    seniors.forEach(s => s.senior?.id && watchSenior(s.senior.id))
  }, [seniors, watchSenior])

  const decide = async (alertId: string, decision: 'APPROVED' | 'DENIED') => {
    setDeciding(true)
    try {
      await api.alerts.decide(alertId, decision, decision === 'DENIED' ? 'Flagged by family member' : undefined)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: decision } : a))
      setNotification(decision === 'APPROVED' ? '✅ Transaction approved' : '🚫 Transaction blocked')
      setTimeout(() => setNotification(null), 4000)
    } catch (err: any) {
      setNotification(`Error: ${err.message}`)
    } finally {
      setDeciding(false)
    }
  }

  const pendingAlerts = alerts.filter(a => a.status === 'PENDING')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">🛡️</div>
        <p className="text-gray-500 text-lg">Loading family dashboard...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-white border-2 border-orange-300 rounded-2xl shadow-xl px-6 py-4 text-base font-semibold text-gray-800 max-w-sm">
          {notification}
        </div>
      )}

      {/* Header */}
      <header className="bg-green-800 text-white px-6 py-5 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👨‍👩‍👧</span>
            <div>
              <h1 className="text-xl font-bold">Family Dashboard</h1>
              <p className="text-green-200 text-sm">Protecting your loved ones · {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {pendingAlerts.length > 0 && (
              <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full animate-pulse">
                {pendingAlerts.length} Need Review
              </span>
            )}
            <button onClick={() => router.push('/family/fraud-detection')}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              🔍 Fraud Detection
            </button>
            <button onClick={logout} className="text-green-200 hover:text-white text-sm">Sign Out</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar - Senior selector */}
        <aside className="w-64 flex-shrink-0 space-y-3">
          <div className="card p-4">
            <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide mb-3">
              Your Seniors
            </h3>
            {seniors.length === 0 ? (
              <p className="text-gray-400 text-sm">No seniors linked yet</p>
            ) : seniors.map(link => (
              <button key={link.id}
                onClick={() => setSelected(link)}
                className={`w-full text-left p-3 rounded-xl transition-colors mb-2 ${
                  selectedSenior?.id === link.id
                    ? 'bg-green-100 border-2 border-green-400'
                    : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                }`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👵</span>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{link.senior?.name}</p>
                    <p className="text-xs text-gray-500">{link.senior?.email}</p>
                  </div>
                </div>
                {link.senior?.accountBalance && (
                  <p className="text-xs text-gray-500 mt-1 pl-8">
                    ${link.senior.accountBalance.toLocaleString()}
                  </p>
                )}
              </button>
            ))}
          </div>

          {/* Quick Stats */}
          {stats && (
            <div className="card p-4 space-y-3">
              <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Quick Stats</h3>
              <div>
                <p className="text-xs text-gray-500">Monthly Spend</p>
                <p className="font-bold text-gray-900">${stats.monthlySpend.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Risky Transactions</p>
                <p className={`font-bold ${stats.riskyCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {stats.riskyCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Fraud Blocked</p>
                <p className="font-bold text-green-700">{stats.caughtFraud}</p>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="flex-1 space-y-4">
          {selectedSenior ? (
            <>
              {/* Senior header */}
              <div className="card flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedSenior.senior?.name}</h2>
                  <p className="text-gray-500 text-sm">{selectedSenior.senior?.email}</p>
                </div>
                {pendingAlerts.length > 0 && (
                  <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-xl font-semibold text-sm">
                    🚨 {pendingAlerts.length} alert{pendingAlerts.length > 1 ? 's' : ''} need{pendingAlerts.length === 1 ? 's' : ''} your review
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                {(['alerts', 'activity', 'stats'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 font-semibold text-sm rounded-xl capitalize transition-colors ${
                      activeTab === tab ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}>
                    {tab === 'alerts' && pendingAlerts.length > 0
                      ? `🚨 Alerts (${pendingAlerts.length})`
                      : tab === 'alerts' ? 'All Alerts'
                      : tab === 'activity' ? 'Activity' : 'Analytics'}
                  </button>
                ))}
              </div>

              {/* Alerts */}
              {activeTab === 'alerts' && (
                <div className="space-y-4">
                  {alerts.length === 0 ? (
                    <div className="card text-center py-12">
                      <div className="text-4xl mb-3">✅</div>
                      <p className="text-lg font-semibold text-gray-700">No alerts</p>
                      <p className="text-gray-400 text-sm mt-1">All recent activity looks normal</p>
                    </div>
                  ) : alerts.map(alert => (
                    <AlertCard key={alert.id} alert={alert}
                      onDecide={alert.status === 'PENDING' ? decide : undefined}
                      deciding={deciding} />
                  ))}
                </div>
              )}

              {/* Activity */}
              {activeTab === 'activity' && (
                <div className="card overflow-hidden p-0">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900">Recent Transactions</h3>
                    <span className="text-sm text-gray-500">{transactions.length} transactions</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {transactions.map(txn => {
                      const riskColor = {
                        LOW: 'text-green-600', MEDIUM: 'text-yellow-600',
                        HIGH: 'text-orange-600', CRITICAL: 'text-red-600'
                      }[txn.riskLevel || 'LOW'] || 'text-gray-600'

                      return (
                        <div key={txn.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              txn.riskLevel === 'CRITICAL' ? 'bg-red-500 animate-pulse' :
                              txn.riskLevel === 'HIGH' ? 'bg-orange-500' :
                              txn.riskLevel === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'
                            }`} />
                            <div>
                              <p className="font-semibold text-gray-900">{txn.merchant}</p>
                              <p className="text-sm text-gray-500">
                                {txn.city} · {txn.mccDesc} · {formatDistanceToNow(new Date(txn.timestamp))} ago
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">${txn.amount.toFixed(2)}</p>
                            <p className={`text-xs font-semibold ${riskColor}`}>{txn.riskLevel}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Analytics */}
              {activeTab === 'stats' && stats && <SpendingChart stats={stats} />}
            </>
          ) : (
            <div className="card text-center py-16">
              <div className="text-4xl mb-4">👨‍👩‍👧</div>
              <p className="text-lg font-semibold text-gray-700">No seniors linked</p>
              <p className="text-gray-400 text-sm mt-1">Ask your family member to add you to their trusted circle</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}