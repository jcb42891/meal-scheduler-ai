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
    <div className="p-4">
      <h1 className="text-2xl font-bold">Calendar</h1>
      {/* Calendar content will go here */}
    </div>
  )
} 