"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Chip } from "@/components/ui/chip"
import { ChevronLeft, ChevronRight, Dice5, Plus, Trash2 } from "lucide-react"
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
  subDays,
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

export default function CalendarPage() {
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
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [isMonthLoading, setIsMonthLoading] = useState(false)
  const [mobileWeekStart, setMobileWeekStart] = useState(startOfWeek(new Date()))
  const [randomizingDate, setRandomizingDate] = useState<string | null>(null)

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

  const getVisibleRange = () => {
    if (window.innerWidth >= 640) {
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
      }
    }

    return {
      start: mobileWeekStart,
      end: endOfWeek(mobileWeekStart)
    }
  }

  const refreshCalendarMeals = async () => {
    const { start, end } = getVisibleRange()

    const { data, error } = await supabase
      .from('meal_calendar')
      .select('date, meal:meals(id, name, category)')
      .eq('group_id', selectedGroupId)
      .gte('date', start.toISOString().split('T')[0])
      .lte('date', end.toISOString().split('T')[0])

    if (error) {
      console.error('Error refreshing calendar:', error)
      toast.error('Failed to load meals')
      return
    }

    const meals = data.reduce((acc, item) => ({
      ...acc,
      [item.date]: item.meal
    }), {})

    setCalendarMeals(meals)
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

      await refreshCalendarMeals()
      toast.success("Meal removed")
    } catch (error) {
      console.error("Error removing meal:", error)
      toast.error("Failed to remove meal")
    }
  }

  const handleRandomMeal = async (day: Date) => {
    if (!selectedGroupId) return

    const dateStr = format(day, "yyyy-MM-dd")
    setRandomizingDate(dateStr)

    try {
      const { data: meals, error: mealsError } = await supabase
        .from('meals')
        .select('id, name, category')
        .eq('group_id', selectedGroupId)

      if (mealsError) throw mealsError
      if (!meals || meals.length === 0) {
        toast.error("No meals available to choose from")
        return
      }

      const recentStart = format(subDays(day, 7), "yyyy-MM-dd")
      const recentEnd = format(subDays(day, 1), "yyyy-MM-dd")
      const { data: recentMeals, error: recentError } = await supabase
        .from('meal_calendar')
        .select('meal_id')
        .eq('group_id', selectedGroupId)
        .gte('date', recentStart)
        .lte('date', recentEnd)

      if (recentError) throw recentError

      const recentMealIds = new Set((recentMeals || []).map((item) => item.meal_id))
      const eligibleMeals = meals.filter((meal) => !recentMealIds.has(meal.id))
      const mealPool = eligibleMeals.length > 0 ? eligibleMeals : meals
      const randomMeal = mealPool[Math.floor(Math.random() * mealPool.length)]

      const { error: insertError } = await supabase
        .from('meal_calendar')
        .insert({
          meal_id: randomMeal.id,
          group_id: selectedGroupId,
          date: dateStr
        })

      if (insertError) throw insertError

      toast.success(`Added ${randomMeal.name}`)
      await refreshCalendarMeals()
    } catch (error) {
      console.error("Error adding random meal:", error)
      toast.error("Failed to add random meal")
    } finally {
      setRandomizingDate(null)
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
      // Don't reset if clicking grocery list button or modal
      if (
        (e.target as HTMLElement).closest("[data-day]") || 
        (e.target as HTMLElement).closest("[role='dialog']") ||
        (e.target as HTMLElement).closest("[data-grocery-button]")
      ) {
        return
      }

      // Reset selection and close grocery list
      setDateRange({ start: null, end: null })
      setShowGroceryList(false)
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
      setShowGroceryList(false)
    } else if (!dateRange.end) {
      // Second click - set end date and ensure correct order
      const start = dateRange.start
      setDateRange({
        start: start <= date ? start : date,
        end: start <= date ? date : start
      })
    } else {
      // Reset and start new selection
      setDateRange({ start: date, end: null })
      setShowGroceryList(false)
    }
  }

  const handleGenerateList = (e: React.MouseEvent) => {
    e.preventDefault()
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
      <div className="min-h-screen bg-background p-5 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full animate-pulse bg-surface-2" />
      </div>
    )
  }

  return (
    <div className="min-h-screen space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Meal Calendar</h1>
          <p className="text-sm text-muted-foreground">Plan meals for your household calendar.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="w-full sm:w-[220px] bg-card">
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

          {dateRange.start && (
            <Button
              onClick={handleGenerateList}
              data-grocery-button
              variant="secondary"
              className="w-full sm:w-auto"
            >
              Generate Grocery List
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <IconButton
              aria-label="Go to previous month"
              onClick={() => {
                if (window.innerWidth >= 640) {
                  handlePrevMonth()
                } else {
                  handlePrevWeek()
                }
              }}
              disabled={isMonthLoading}
            >
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <div className="flex-1 text-center">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground truncate">
                <span className="hidden sm:inline">
                  {format(currentDate, "MMMM yyyy")}
                </span>
                <span className="sm:hidden">
                  {format(mobileWeekStart, "MMM d")} - {format(endOfWeek(mobileWeekStart), "MMM d")}
                </span>
              </h2>
            </div>
            <IconButton
              aria-label="Go to next month"
              onClick={() => {
                if (window.innerWidth >= 640) {
                  handleNextMonth()
                } else {
                  handleNextWeek()
                }
              }}
              disabled={isMonthLoading}
            >
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          </div>

          <div className="hidden sm:block">
            <div className="grid grid-cols-7 border border-border/60 rounded-lg overflow-hidden relative">
              {isMonthLoading && (
                <div className="absolute inset-0 bg-background/80 z-10 transition-opacity duration-200" />
              )}
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                <div
                  key={dayName}
                  className="bg-surface-2 p-2 text-center text-xs font-semibold text-muted-foreground border-b border-r border-border/60 last:border-r-0"
                >
                  {dayName}
                </div>
              ))}
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd")
                const meal = calendarMeals[dateStr]
                const isOutsideMonth = !isSameMonth(day, currentDate)
                const isToday = isSameDay(day, new Date())
                const isSingleSelection = !!dateRange.start && (!dateRange.end || (dateRange.end && isSameDay(dateRange.start, dateRange.end)))
                const mealsForDay = meal ? [meal] : []

                return (
                  <div
                    key={dateStr}
                    data-day
                    onClick={(e) => handleDateClick(day, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleDateClick(day, e as unknown as React.MouseEvent)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Select ${format(day, "MMMM d, yyyy")}`}
                    className={cn(
                      "group min-h-[92px] sm:min-h-[108px] border-b border-r border-border/60 p-2.5 bg-card relative cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isOutsideMonth && "text-muted-foreground/60",
                      meal && "bg-surface-2/50",
                      isDateInRange(day) && "bg-primary/5",
                      isSingleSelection && dateRange.start && isSameDay(day, dateRange.start) && "ring-2 ring-primary/40",
                      dateRange.end && isRangeStart(day) && "ring-2 ring-primary/40",
                      dateRange.end && isRangeEnd(day) && "ring-2 ring-primary/40",
                      !meal && "hover:bg-surface-2/60",
                      meal && "hover:bg-surface-2/70"
                    )}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium text-muted-foreground",
                          isToday && "rounded-full bg-primary/10 px-2 py-0.5 text-primary",
                          isOutsideMonth && "text-muted-foreground/50"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {selectedGroupId && (
                        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition flex items-center gap-2">
                          {meal ? (
                            <IconButton
                              aria-label={`Remove meal on ${format(day, "MMMM d")}`}
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteMeal(dateStr)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedDate(day)
                                  setShowAddMeal(true)
                                }}
                                aria-label={`Add meal on ${format(day, "MMMM d")}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span className="hidden lg:inline">Add meal</span>
                              </Button>
                              <IconButton
                                aria-label={`Add random meal on ${format(day, "MMMM d")}`}
                                variant="subtle"
                                disabled={randomizingDate === dateStr}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRandomMeal(day)
                                }}
                              >
                                <Dice5 className="h-4 w-4" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {mealsForDay.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {mealsForDay.slice(0, 3).map((mealItem, index) => (
                          <Chip
                            key={mealItem.id}
                            className={cn(
                              "w-full justify-start truncate text-xs font-medium",
                              getCategoryColor(mealItem.category as MealCategory),
                              index === 2 && "hidden lg:inline-flex",
                              isOutsideMonth && "opacity-60"
                            )}
                          >
                            {mealItem.name}
                          </Chip>
                        ))}
                        {mealsForDay.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{mealsForDay.length - 3} more</span>
                        )}
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
                <div className="absolute inset-0 bg-background/80 z-10 transition-opacity duration-200" />
              )}
              {mobileDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd")
                const meal = calendarMeals[dateStr]

                return (
                  <div
                    key={day.toISOString()}
                    data-day
                    onClick={(e) => handleDateClick(day, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleDateClick(day, e as unknown as React.MouseEvent)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Select ${format(day, "MMMM d, yyyy")}`}
                    className={cn(
                      "p-3 bg-card rounded-xl border border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "hover:bg-surface-2/60",
                      meal && "bg-surface-2/50",
                      isDateInRange(day) && "ring-2 ring-primary/40 z-10"
                    )}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {format(day, "EEE")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(day, "MMM d")}
                        </span>
                      </div>
                      {selectedGroupId && (
                        <div className="flex items-center gap-2">
                          {meal ? (
                            <IconButton
                              aria-label={`Remove meal on ${format(day, "MMMM d")}`}
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteMeal(dateStr)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          ) : (
                            <>
                              <IconButton
                                aria-label={`Add meal on ${format(day, "MMMM d")}`}
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedDate(day)
                                  setShowAddMeal(true)
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                aria-label={`Add random meal on ${format(day, "MMMM d")}`}
                                variant="subtle"
                                disabled={randomizingDate === dateStr}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRandomMeal(day)
                                }}
                              >
                                <Dice5 className="h-4 w-4" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {meal && (
                      <div className="mt-2">
                        <Chip className={cn("w-full justify-start truncate", getCategoryColor(meal.category as MealCategory))}>
                          {meal.name}
                        </Chip>
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
            await refreshCalendarMeals()
          }}
        />
      )}

      {dateRange.start && (
        <GroceryListModal
          open={showGroceryList}
          onOpenChange={setShowGroceryList}
          groupId={selectedGroupId}
          startDate={dateRange.start}
          endDate={dateRange.end || dateRange.start}
        />
      )}
    </div>
  )
}
