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
      <body className="min-h-screen bg-background text-foreground">
        <AuthProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {children}
          </main>
          <Toaster offset={16} />
        </AuthProvider>
      </body>
    </html>
  )
} 
