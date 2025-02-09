'use client'

import { useAuth } from '@/lib/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function CalendarPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) {
      router.push('/auth')
    }
  }, [user, router])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <div className="flex items-center gap-4">
          {/* Add calendar controls here later */}
        </div>
      </div>
      
      <div className="rounded-lg border bg-white shadow">
        {/* Calendar content will go here */}
        <div className="p-6">
          <p className="text-muted-foreground">Calendar content coming soon...</p>
        </div>
      </div>
    </div>
  )
} 