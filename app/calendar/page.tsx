"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/contexts/AuthContext"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, PlusCircle, Trash2 } from "lucide-react"
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  subWeeks,
  addWeeks,
  isSameDay,
} from "date-fns"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { AddMealModal } from "./add-meal-modal"
import { GroceryListModal } from "./grocery-list-modal"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MealCategory, getCategoryColor } from "@/app/meals/meal-utils"
import { cn } from "@/lib/utils"

type GroupMember = {
  group: {
    id: string
    name: string
  }
}

type MealCalendarResponse = {
  date: string
  meal: {
    id: string
    name: string
    category: string
  }
}

export default function CalendarPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [userGroups, setUserGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [calendarMeals, setCalendarMeals] = useState<Record<string, { id: string; name: string; category: string }>>({})
  const [dateRange, setDateRange] = useState<{
    start: Date | null
    end: Date | null
  }>({ start: null, end: null })
  const [showGroceryList, setShowGroceryList] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [isMonthLoading, setIsMonthLoading] = useState(false)
  const [mobileWeekStart, setMobileWeekStart] = useState(startOfWeek(new Date()))

  useEffect(() => {
    const checkAuth = async () => {
      setIsAuthChecking(true)
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) {
          router.push('/auth')
          return
        }
        fetchUserGroups()
      } finally {
        setIsAuthChecking(false)
      }
    }

    checkAuth()
  }, [router])

  const fetchUserGroups = async () => {
    setIsLoading(true)
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) return

      // Get groups where user is owner
      const { data: ownedGroups, error: ownedError } = await supabase
        .from("groups")
        .select("id, name")
        .eq("owner_id", currentUser.id)
        .returns<{ id: string; name: string }[]>()

      if (ownedError) {
        console.error("Error fetching owned groups:", ownedError)
        toast.error("Failed to load groups")
        return
      }

      // Get groups where user is member
      const { data: memberGroups, error: memberError } = await supabase
        .from("group_members")
        .select("group:groups(id, name)")
        .eq("user_id", currentUser.id)
        .returns<GroupMember[]>()

      if (memberError) {
        console.error("Error fetching member groups:", memberError)
        toast.error("Failed to load groups")
        return
      }

      // Combine and deduplicate groups
      const allGroups = [
        ...ownedGroups,
        ...memberGroups.map((m) => ({
          id: m.group.id,
          name: m.group.name,
        })),
      ].filter((group, index, self) => index === self.findIndex((g) => g.id === group.id))

      setUserGroups(allGroups || [])
      if (allGroups.length > 0 && !selectedGroupId) {
        setSelectedGroupId(allGroups[0].id)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true

    if (selectedGroupId) {
      const fetchMeals = async () => {
        if (!mounted) return
        setIsMonthLoading(true)
        
        try {
          const start = startOfMonth(currentDate)
          const end = endOfMonth(currentDate)
          
          const { data, error } = await supabase
            .from('meal_calendar')
            .select('date, meal:meals(id, name, category)')
            .eq('group_id', selectedGroupId)
            .gte('date', start.toISOString().split('T')[0])
            .lte('date', end.toISOString().split('T')[0])

          if (!mounted) return
          if (error) throw error

          const meals = data.reduce((acc, item) => ({
            ...acc,
            [item.date]: item.meal
          }), {})

          setCalendarMeals(meals)
        } catch (error) {
          console.error('Error fetching calendar meals:', error)
          if (mounted) {
            toast.error('Failed to load meals')
          }
        } finally {
          if (mounted) {
            setIsMonthLoading(false)
          }
        }
      }

      fetchMeals()
    }

    return () => {
      mounted = false
    }
  }, [selectedGroupId, currentDate])

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  })

  const mobileDays = eachDayOfInterval({
    start: mobileWeekStart,
    end: endOfWeek(mobileWeekStart)
  })

  const handlePrevMonth = async () => {
    setIsMonthLoading(true)
    setCurrentDate(prevDate => {
      const newDate = subMonths(prevDate, 1)
      return newDate
    })
  }

  const handleNextMonth = async () => {
    setIsMonthLoading(true)
    setCurrentDate(prevDate => {
      const newDate = addMonths(prevDate, 1)
      return newDate
    })
  }

  const handlePrevWeek = () => {
    setMobileWeekStart(prev => subWeeks(prev, 1))
  }

  const handleNextWeek = () => {
    setMobileWeekStart(prev => addWeeks(prev, 1))
  }

  const deleteMeal = async (dateStr: string) => {
    if (!selectedGroupId) return

    try {
      const { error } = await supabase
        .from("meal_calendar")
        .delete()
        .eq("group_id", selectedGroupId)
        .eq("date", dateStr)

      if (error) throw error

      // Fetch updated meals for the current week/month
      const start = window.innerWidth >= 640 
        ? startOfMonth(currentDate)
        : mobileWeekStart
      const end = window.innerWidth >= 640
        ? endOfMonth(currentDate)
        : endOfWeek(mobileWeekStart)

      const { data: updatedData, error: fetchError } = await supabase
        .from('meal_calendar')
        .select('date, meal:meals(id, name, category)')
        .eq('group_id', selectedGroupId)
        .gte('date', start.toISOString().split('T')[0])
        .lte('date', end.toISOString().split('T')[0])

      if (fetchError) throw fetchError

      const meals = updatedData.reduce((acc, item) => ({
        ...acc,
        [item.date]: item.meal
      }), {})

      setCalendarMeals(meals)
      toast.success("Meal removed")
    } catch (error) {
      console.error("Error removing meal:", error)
      toast.error("Failed to remove meal")
    }
  }

  const isDateInRange = (date: Date) => {
    if (dateRange.start && !dateRange.end) {
      return format(date, "yyyy-MM-dd") === format(dateRange.start, "yyyy-MM-dd")
    }
    if (!dateRange.start || !dateRange.end) return false
    return date >= dateRange.start && date <= dateRange.end
  }

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (
        !(e.target as HTMLElement).closest("[data-day]") && 
        !(e.target as HTMLElement).closest("[role='dialog']") &&
        !(e.target as HTMLElement).closest("[data-grocery-button]")
      ) {
        setDateRange({ start: null, end: null })
        setIsSelecting(false)
        setShowGroceryList(false)
      }
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  const handleDateClick = (date: Date, e: React.MouseEvent) => {
    e.stopPropagation()

    // Don't handle range selection if clicking on meal actions
    if ((e.target as HTMLElement).closest('button')) return

    if (!dateRange.start) {
      // First click - set start date
      setDateRange({ start: date, end: null })
      setIsSelecting(true)
      setShowGroceryList(false)
    } else if (!dateRange.end) {
      // Second click - set end date and ensure correct order
      const start = dateRange.start
      setDateRange({
        start: start <= date ? start : date,
        end: start <= date ? date : start
      })
      setIsSelecting(false)
    } else {
      // Reset and start new selection
      setDateRange({ start: date, end: null })
      setIsSelecting(true)
      setShowGroceryList(false)
    }
  }

  const handleGenerateList = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowGroceryList(true)
  }

  const isRangeStart = (date: Date) => {
    if (!dateRange.start) return false
    return isSameDay(date, dateRange.start)
  }

  const isRangeEnd = (date: Date) => {
    if (!dateRange.end) return false
    return isSameDay(date, dateRange.end)
  }

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#F5E6D3] p-6 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full animate-pulse bg-gray-200" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5E6D3] p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-[#2F4F4F]">Meal Calendar</h1>
        <div className={cn("w-[200px] h-10 rounded-md", isLoading && "animate-pulse bg-gray-200")} />
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="w-[200px] bg-white/80 backdrop-blur border-[#98C1B2] text-[#2F4F4F]">
            <SelectValue placeholder="Select a group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Select a group">Select a group</SelectItem>
            {userGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-[#98C1B2] bg-white/80 backdrop-blur shadow-lg">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-8">
            <Button 
              variant="ghost" 
              onClick={() => {
                if (window.innerWidth >= 640) {
                  handlePrevMonth()
                } else {
                  handlePrevWeek()
                }
              }} 
              disabled={isMonthLoading}
              className="shrink-0 px-1 sm:px-4"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-base sm:text-2xl font-semibold text-[#2F4F4F] mx-2 truncate">
              <span className="hidden sm:inline">
                {format(currentDate, "MMMM yyyy")}
              </span>
              <span className="sm:hidden">
                {format(mobileWeekStart, "MMM d")} - {format(endOfWeek(mobileWeekStart), "MMM d")}
              </span>
            </h2>
            <Button 
              variant="ghost" 
              onClick={() => {
                if (window.innerWidth >= 640) {
                  handleNextMonth()
                } else {
                  handleNextWeek()
                }
              }}
              disabled={isMonthLoading}
              className="shrink-0 px-1 sm:px-4"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="hidden sm:block">
            <div className="grid grid-cols-7 gap-px bg-[#98C1B2]/20 rounded-lg overflow-hidden relative">
              {isMonthLoading && (
                <div className="absolute inset-0 bg-white/80 z-10 transition-opacity duration-200" />
              )}
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                <div key={dayName} className="bg-[#98C1B2]/10 p-3 text-center text-sm font-medium text-[#2F4F4F]">
                  {dayName}
                </div>
              ))}
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd")
                const meal = calendarMeals[dateStr]

                return (
                  <div
                    key={dateStr}
                    data-day
                    onClick={(e) => handleDateClick(day, e)}
                    className={cn(
                      "min-h-[100px] sm:min-h-[120px] p-3 bg-white relative cursor-pointer",
                      "hover:bg-[#98C1B2]/5",
                      !isSameMonth(day, currentDate) && "text-muted-foreground",
                      meal && "bg-[#98C1B2]/10",
                      isDateInRange(day) && [
                        "relative z-10",
                        // If it's a single day selection (no end date) or start and end are the same day
                        (!dateRange.end || (dateRange.end && isSameDay(dateRange.start!, dateRange.end))) && "border-2 border-[#FF9B76]",
                        // If it's part of a range (has end date)
                        dateRange.end && [
                          "border-t-2 border-b-2 border-[#FF9B76]",
                          isRangeStart(day) && "border-l-2 border-[#FF9B76]",
                          isRangeEnd(day) && "border-r-2 border-[#FF9B76]",
                        ]
                      ]
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium">
                        {format(day, "d")}
                      </span>
                      {selectedGroupId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            meal ? "text-red-500 hover:text-red-600" : ""
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (meal) {
                              deleteMeal(dateStr)
                            } else {
                              setSelectedDate(day)
                              setShowAddMeal(true)
                            }
                          }}
                        >
                          {meal ? <Trash2 className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    
                    {meal && (
                      <div className={cn(
                        "mt-1 p-2 rounded-md",
                        getCategoryColor(meal.category as MealCategory)
                      )}>
                        <div className="text-sm font-medium">
                          {meal.name}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="sm:hidden">
            <div className="flex flex-col gap-2 relative">
              {isMonthLoading && (
                <div className="absolute inset-0 bg-white/80 z-10 transition-opacity duration-200" />
              )}
              {mobileDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd")
                const meal = calendarMeals[dateStr]

                return (
                  <div
                    key={day.toISOString()}
                    data-day
                    onClick={(e) => handleDateClick(day, e)}
                    className={cn(
                      "p-4 bg-white rounded-lg border border-[#98C1B2]/30",
                      "hover:bg-[#98C1B2]/5",
                      meal && "bg-[#98C1B2]/10",
                      isDateInRange(day) && "ring-2 ring-[#FF9B76] z-10"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-medium">
                          {format(day, "EEE")}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {format(day, "MMM d")}
                        </span>
                      </div>
                      {selectedGroupId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-8 w-8",
                            meal ? "text-red-500 hover:text-red-600" : ""
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (meal) {
                              deleteMeal(dateStr)
                            } else {
                              setSelectedDate(day)
                              setShowAddMeal(true)
                            }
                          }}
                        >
                          {meal ? <Trash2 className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    
                    {meal && (
                      <div className={cn(
                        "mt-2 p-2 rounded-md",
                        getCategoryColor(meal.category as MealCategory)
                      )}>
                        <div className="text-sm font-medium">
                          {meal.name}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedDate && (
        <AddMealModal
          open={showAddMeal}
          onOpenChange={setShowAddMeal}
          groupId={selectedGroupId}
          date={selectedDate}
          onMealAdded={async () => {
            // Fetch updated meals for the current week/month
            const start = window.innerWidth >= 640 
              ? startOfMonth(currentDate)
              : mobileWeekStart
            const end = window.innerWidth >= 640
              ? endOfMonth(currentDate)
              : endOfWeek(mobileWeekStart)

            const { data, error } = await supabase
              .from('meal_calendar')
              .select('date, meal:meals(id, name, category)')
              .eq('group_id', selectedGroupId)
              .gte('date', start.toISOString().split('T')[0])
              .lte('date', end.toISOString().split('T')[0])

            if (error) {
              console.error('Error refreshing calendar:', error)
              return
            }

            const meals = data.reduce((acc, item) => ({
              ...acc,
              [item.date]: item.meal
            }), {})

            setCalendarMeals(meals)
          }}
        />
      )}

      {dateRange.start && (
        <>
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleGenerateList}
              data-grocery-button
              className="bg-[#FF9B76] hover:bg-[#FF9B76]/90 text-white font-medium px-6 py-2 rounded-full shadow-md hover:shadow-lg transition-all duration-200"
            >
              Generate Grocery List
            </Button>
          </div>

          <GroceryListModal
            open={showGroceryList}
            onOpenChange={setShowGroceryList}
            groupId={selectedGroupId}
            startDate={dateRange.start}
            endDate={dateRange.end || dateRange.start}
          />
        </>
      )}
    </div>
  )
}

