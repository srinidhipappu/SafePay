'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, User } from '@/lib/api'
import { useRouter } from 'next/navigation'

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const refresh = async () => {
    try {
      const me = await api.auth.me()
      setUser(me)
    } catch {
      setUser(null)
      localStorage.removeItem('safepay_token')
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('safepay_token')
    if (token) {
      refresh().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const { user, token } = await api.auth.login(email, password)
    localStorage.setItem('safepay_token', token)
    setUser(user)
    router.push(user.role === 'SENIOR' ? '/senior' : '/family')
  }

  const logout = () => {
    localStorage.removeItem('safepay_token')
    setUser(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
