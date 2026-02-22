'use client'
import { useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) router.push('/login')
    else if (user.role === 'SENIOR') router.push('/senior')
    else router.push('/family')
  }, [user, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">🛡️</div>
        <p className="text-gray-400">Redirecting...</p>
      </div>
    </div>
  )
}
