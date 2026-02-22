'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import Link from 'next/link'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (role: 'senior' | 'family') => {
    setEmail(role === 'senior' ? 'margaret@demo.com' : 'sarah@demo.com')
    setPassword('demo1234')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <span className="text-3xl">🛡️</span>
          </div>
          <h1 className="text-3xl font-bold text-white">SafePay Family</h1>
          <p className="text-blue-200 mt-1">AI-Powered Financial Protection</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Sign in to your account</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="you@example.com" required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="••••••••" required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full text-lg py-4 mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo shortcuts */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-500 text-center mb-3 font-medium">DEMO ACCOUNTS</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => fillDemo('senior')}
                className="border-2 border-blue-200 text-blue-700 rounded-xl py-3 px-4 text-sm font-semibold hover:bg-blue-50 transition-colors">
                👵 Senior Demo
              </button>
              <button onClick={() => fillDemo('family')}
                className="border-2 border-green-200 text-green-700 rounded-xl py-3 px-4 text-sm font-semibold hover:bg-green-50 transition-colors">
                👨‍👩‍👧 Family Demo
              </button>
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-600 font-semibold hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
