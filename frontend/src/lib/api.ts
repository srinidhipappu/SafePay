// lib/api.ts - Typed API client

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('safepay_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const api = {
  auth: {
    login:    (email: string, password: string) =>
      request<{ user: User; token: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password })
      }),
    register: (data: RegisterData) =>
      request<{ user: User; token: string }>('/auth/register', {
        method: 'POST', body: JSON.stringify(data)
      }),
    me: () => request<User>('/auth/me'),
  },

  transactions: {
    list:   (params?: TransactionParams) => request<TransactionListResponse>(`/transactions?${new URLSearchParams(params as any)}`),
    create: (data: NewTransaction)       => request<any>('/transactions', { method: 'POST', body: JSON.stringify(data) }),
    stats:  (seniorId?: string)          => request<Stats>(`/transactions/stats${seniorId ? `?seniorId=${seniorId}` : ''}`),
  },

  alerts: {
    list:   (params?: AlertParams) => request<AlertListResponse>(`/alerts?${new URLSearchParams(params as any)}`),
    get:    (id: string)           => request<Alert>(`/alerts/${id}`),
    decide: (id: string, decision: 'APPROVED' | 'DENIED', note?: string) =>
      request<any>(`/alerts/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  },

  trusted: {
    list:   ()             => request<TrustedLink[]>('/trusted'),
    invite: (email: string) => request<TrustedLink>('/trusted/invite', { method: 'POST', body: JSON.stringify({ email }) }),
    remove: (familyId: string) => request<any>(`/trusted/${familyId}`, { method: 'DELETE' }),
  },

  users: {
    updateSettings: (data: Partial<UserSettings>) =>
      request<User>('/users/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: string; email: string; name: string; role: 'SENIOR' | 'FAMILY'
  accountBalance?: number; protectionMode?: boolean; riskThreshold?: number
  phone?: string; createdAt?: string
}

export interface Transaction {
  id: string; userId: string; amount: number; merchant: string
  mcc: string; mccDesc: string; city: string; timestamp: string
  riskScore?: number; riskLevel?: string; riskFlags?: RiskFlag[]
  anomalyScore?: number; fraudProbability?: number
  alert?: { id: string; status: string } | null
}

export interface RiskFlag {
  flag: string; description: string; severity: 'high' | 'medium' | 'low'
}

export interface Alert {
  id: string; seniorId: string; transactionId: string
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED'
  aiSummary?: string; aiReasons?: string[]; aiAction?: string
  createdAt: string; resolvedAt?: string
  transaction: Transaction
  senior: { id: string; name: string; email: string }
  approvals: Approval[]
}

export interface Approval {
  id: string; alertId: string; userId: string
  decision: 'APPROVED' | 'DENIED'; note?: string; createdAt: string
  user: { id: string; name: string; role: string }
}

export interface TrustedLink {
  id: string; seniorId: string; familyId: string; status: string
  family?: { id: string; name: string; email: string }
  senior?: { id: string; name: string; email: string; accountBalance?: number }
}

export interface Stats {
  totalSpend: number; totalCount: number
  monthlySpend: number; monthlyCount: number
  riskyCount: number; caughtFraud: number
  byCategory: { name: string; amount: number; count: number }[]
  recentActivity: { amount: number; timestamp: string; riskLevel?: string }[]
}

interface RegisterData { email: string; password: string; name: string; role: 'SENIOR' | 'FAMILY' }
interface TransactionParams { limit?: string; offset?: string; seniorId?: string }
interface TransactionListResponse { transactions: Transaction[]; total: number }
interface AlertParams { status?: string; seniorId?: string; limit?: string }
interface AlertListResponse { alerts: Alert[]; total: number }
interface NewTransaction { amount: number; merchant: string; mcc: string; mccDesc: string; city: string }
interface UserSettings { protectionMode: boolean; riskThreshold: number; name: string; phone: string }
