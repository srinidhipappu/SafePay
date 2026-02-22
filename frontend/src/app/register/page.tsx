'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm]   = useState({ name: '', email: '', password: '', role: 'SENIOR' as 'SENIOR' | 'FAMILY' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { user, token } = await api.auth.register(form)
      localStorage.setItem('safepay_token', token)
      router.push(user.role === 'SENIOR' ? '/senior' : '/family')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">🛡️</span>
          <h1 className="text-3xl font-bold text-white mt-2">SafePay Family</h1>
        </div>
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Account</h2>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">{error}</div>}

          {/* Role selector */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {(['SENIOR', 'FAMILY'] as const).map(role => (
              <button key={role} type="button" onClick={() => setForm({...form, role})}
                className={`py-4 rounded-xl border-2 font-semibold text-sm transition-colors ${
                  form.role === role ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {role === 'SENIOR' ? '👵 I\'m a Senior' : '👨‍👩‍👧 I\'m a Family Member'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="input" placeholder="Your name" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="input" placeholder="you@example.com" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                className="input" placeholder="Min 8 characters" minLength={8} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-lg mt-2">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
