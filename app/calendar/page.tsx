'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, PlusCircle } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { AddMealModal } from './add-meal-modal'

type GroupMember = {
  group: {
    id: string
    name: string
  }
}

export default function CalendarPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [userGroups, setUserGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [calendarMeals, setCalendarMeals] = useState<Record<string, { id: string; name: string }>>({})

  useEffect(() => {
    if (!user) {
      router.push('/auth')
    } else {
      fetchUserGroups()
    }
  }, [user, router])

  const fetchUserGroups = async () => {
    // Get groups where user is owner
    const { data: ownedGroups, error: ownedError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('owner_id', user?.id)

    if (ownedError) {
      console.error('Error fetching owned groups:', ownedError)
      toast.error('Failed to load groups')
      return
    }

    // Get groups where user is member
    const { data: memberGroups, error: memberError } = await supabase
      .from('group_members')
      .select('group:groups(id, name)')
      .eq('user_id', user?.id)
      .returns<GroupMember[]>()

    if (memberError) {
      console.error('Error fetching member groups:', memberError)
      toast.error('Failed to load groups')
      return
    }

    // Combine and deduplicate groups
    const allGroups = [
      ...ownedGroups,
      ...memberGroups.map(m => ({
        id: m.group.id,
        name: m.group.name
      }))
    ].filter((group, index, self) => 
      index === self.findIndex((g) => g.id === group.id)
    )

    setUserGroups(allGroups || [])
    if (allGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(allGroups[0].id)
    }
  }

  const fetchCalendarMeals = async () => {
    if (!selectedGroupId) return

    const startDate = startOfMonth(currentDate)
    const endDate = endOfMonth(currentDate)

    const { data, error } = await supabase
      .from('meal_calendar')
      .select(`
        date,
        meal:meals(id, name)
      `)
      .eq('group_id', selectedGroupId)
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString())

    if (error) {
      toast.error('Failed to load calendar meals')
      return
    }

    const mealsMap: Record<string, { id: string; name: string }> = {}
    data.forEach(item => {
      mealsMap[item.date] = item.meal
    })
    setCalendarMeals(mealsMap)
  }

  useEffect(() => {
    if (selectedGroupId) {
      fetchCalendarMeals()
    }
  }, [selectedGroupId, currentDate])

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
        <select
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="h-10 w-[200px] rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select a group</option>
          {userGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
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
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const meal = calendarMeals[dateStr]
              
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[100px] bg-white p-2 ${
                    !isSameMonth(day, currentDate) ? 'text-gray-400' : ''
                  } ${meal ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <time dateTime={dateStr}>
                      {format(day, 'd')}
                    </time>
                    {!meal && isSameMonth(day, currentDate) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setSelectedDate(day)
                          setShowAddMeal(true)
                        }}
                      >
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {meal && (
                    <div className="mt-1 text-sm font-medium text-blue-700">
                      {meal.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {selectedDate && (
        <AddMealModal
          open={showAddMeal}
          onOpenChange={setShowAddMeal}
          groupId={selectedGroupId}
          date={selectedDate}
          onMealAdded={fetchCalendarMeals}
        />
      )}
    </div>
  )
} 