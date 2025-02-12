'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns'

export default function CalendarPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())

  if (!user) {
    router.push('/auth')
    return null
  }

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  })

  const previousMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
      </div>
      
      <div className="rounded-lg border bg-white shadow">
        <div className="p-4">
          {/* Calendar header */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={previousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-semibold">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <Button variant="ghost" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="bg-gray-50 p-2 text-center text-sm font-medium text-gray-500"
              >
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {days.map((day, dayIdx) => (
              <div
                key={day.toISOString()}
                className={`min-h-[100px] bg-white p-2 ${
                  !isSameMonth(day, currentDate) ? 'text-gray-400' : ''
                }`}
              >
                <time dateTime={format(day, 'yyyy-MM-dd')}>
                  {format(day, 'd')}
                </time>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 