import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/AuthContext'

export const metadata: Metadata = {
  title: 'SafePay Family — AI Financial Protection for Seniors',
  description: 'Protecting seniors from fraud with personalized AI and family oversight',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
