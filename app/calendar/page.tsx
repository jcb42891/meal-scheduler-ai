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
} from "date-fns"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { AddMealModal } from "./add-meal-modal"
import { GroceryListModal } from "./grocery-list-modal"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  const [calendarMeals, setCalendarMeals] = useState<Record<string, { id: string; name: string }>>({})
  const [dateRange, setDateRange] = useState<{
    start: Date | null
    end: Date | null
  }>({ start: null, end: null })
  const [showGroceryList, setShowGroceryList] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push("/auth")
    } else {
      fetchUserGroups()
    }
  }, [user, router])

  const fetchUserGroups = async () => {
    // Get groups where user is owner
    const { data: ownedGroups, error: ownedError } = await supabase
      .from("groups")
      .select("id, name")
      .eq("owner_id", user?.id)
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
      .eq("user_id", user?.id)
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
  }

  const fetchCalendarMeals = async () => {
    if (!selectedGroupId) return

    const startDate = startOfMonth(currentDate)
    const endDate = endOfMonth(currentDate)

    const { data, error } = await supabase
      .from("meal_calendar")
      .select(`
        date,
        meal:meals(id, name)
      `)
      .eq("group_id", selectedGroupId)
      .gte("date", startDate.toISOString())
      .lte("date", endDate.toISOString())
      .returns<MealCalendarResponse[]>()

    if (error) {
      toast.error("Failed to load calendar meals")
      return
    }

    const mealsMap: Record<string, { id: string; name: string }> = {}
    data.forEach((item) => {
      mealsMap[item.date] = item.meal
    })
    setCalendarMeals(mealsMap)
  }

  useEffect(() => {
    if (selectedGroupId) {
      fetchCalendarMeals()
    }
  }, [selectedGroupId, currentDate, fetchCalendarMeals]) // Added fetchCalendarMeals to dependencies

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  })

  const previousMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))

  const deleteMeal = async (dateStr: string) => {
    if (!selectedGroupId) return

    try {
      const { error } = await supabase
        .from("meal_calendar")
        .delete()
        .eq("group_id", selectedGroupId)
        .eq("date", dateStr)

      if (error) throw error

      toast.success("Meal removed")
      fetchCalendarMeals()
    } catch (error) {
      console.error("Error removing meal:", error)
      toast.error("Failed to remove meal")
    }
  }

  const isDateInRange = (date: Date) => {
    if (!dateRange.start || !dateRange.end) return false
    return date >= dateRange.start && date <= dateRange.end
  }

  const handleCalendarClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-day]") === null) {
      setDateRange({ start: null, end: null })
      setIsSelecting(false)
      setShowGroceryList(false)
    }
  }

  const handleDateClick = (date: Date, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!isSelecting) {
      setDateRange({ start: date, end: null })
      setIsSelecting(true)
      setShowGroceryList(false)
    } else {
      const start = dateRange.start!
      const end = date
      setDateRange({
        start: start < end ? start : end,
        end: start < end ? end : start,
      })
      setIsSelecting(false)
    }
  }

  const handleGenerateList = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowGroceryList(true)
  }

  return (
    <div className="min-h-screen bg-[#F5E6D3] p-6 space-y-6" onClick={handleCalendarClick}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-[#2F4F4F]">Meal Calendar</h1>
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="w-[200px] bg-white/80 backdrop-blur border-[#98C1B2] text-[#2F4F4F]">
            <SelectValue placeholder="Select a group" />
          </SelectTrigger>
          <SelectContent>
            {/* Changed default value to "Select a group" */}
            <SelectItem value="Select a group">Select a group</SelectItem> {/* Added value prop */}
            {userGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-[#98C1B2] bg-white/80 backdrop-blur shadow-lg">
        <div className="p-6">
          {/* Calendar header */}
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={previousMonth} className="hover:text-[#2F4F4F] hover:bg-[#98C1B2]/20">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-2xl font-semibold text-[#2F4F4F]">{format(currentDate, "MMMM yyyy")}</h2>
            <Button variant="ghost" onClick={nextMonth} className="hover:text-[#2F4F4F] hover:bg-[#98C1B2]/20">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-[#98C1B2]/20 rounded-lg overflow-hidden">
            {/* Day headers */}
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="bg-[#98C1B2]/10 p-3 text-center text-sm font-medium text-[#2F4F4F]">
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd")
              const meal = calendarMeals[dateStr]

              return (
                <div
                  key={day.toISOString()}
                  data-day="true"
                  className={`min-h-[120px] bg-white p-3 transition-all duration-200
                    ${!isSameMonth(day, currentDate) ? "text-gray-400 bg-gray-50" : ""}
                    ${meal ? "bg-[#98C1B2]/10" : ""}
                    ${isDateInRange(day) ? "ring-2 ring-[#FF9B76]" : ""}
                    ${dateRange.start && format(dateRange.start, "yyyy-MM-dd") === dateStr ? "ring-2 ring-[#FF9B76] ring-offset-2" : ""}
                    hover:bg-[#98C1B2]/5 cursor-pointer
                  `}
                  onClick={(e) => handleDateClick(day, e)}
                >
                  <div className="flex justify-between items-start">
                    <time dateTime={dateStr} className="font-medium text-[#2F4F4F]">
                      {format(day, "d")}
                    </time>
                    {isSameMonth(day, currentDate) &&
                      (meal ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteMeal(dateStr)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[#2F4F4F] hover:text-[#98C1B2] hover:bg-[#98C1B2]/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedDate(day)
                            setShowAddMeal(true)
                          }}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      ))}
                  </div>
                  {meal && (
                    <div className="mt-2 p-2 rounded-lg bg-[#98C1B2]/20 text-sm font-medium text-[#2F4F4F]">
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

      {dateRange.start && (
        <>
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleGenerateList}
              className="bg-[#FF9B76] hover:bg-[#FF9B76]/90 text-white font-medium px-6 py-2 rounded-full shadow-md hover:shadow-lg transition-all duration-200"
            >
              Generate Grocery List
            </Button>
          </div>

          <GroceryListModal
            open={showGroceryList}
            onOpenChange={(open) => {
              setShowGroceryList(open)
              if (!open) {
                setDateRange({ start: null, end: null })
                setIsSelecting(false)
              }
            }}
            groupId={selectedGroupId}
            startDate={dateRange.start}
            endDate={dateRange.end || dateRange.start}
          />
        </>
      )}
    </div>
  )
}

