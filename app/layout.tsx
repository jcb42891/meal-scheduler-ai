import React from 'react'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { Navbar } from '@/components/navbar'
import './globals.css'
import { Toaster } from 'sonner'
import { GeistSans } from 'geist/font/sans'
import { Playfair_Display } from 'next/font/google'

const playfair = Playfair_Display({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body className="min-h-screen bg-[#F5E6D3]">
        <AuthProvider>
          <Navbar />
          <main className="container mx-auto px-4 py-6">
            {children}
          </main>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
} 