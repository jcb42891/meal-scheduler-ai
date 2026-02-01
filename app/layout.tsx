import React from 'react'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { Navbar } from '@/app/components/navbar'
import './globals.css'
import { Toaster } from 'sonner'
import { GeistSans } from 'geist/font/sans'

export const metadata = {
  title: 'Pantry Planner',
  description: 'Plan your meals and organize your grocery shopping',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={GeistSans.className}>
      <head />
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
