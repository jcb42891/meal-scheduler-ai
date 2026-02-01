'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { MEAL_CATEGORIES, MealCategory, WEEKNIGHT_FRIENDLY_LABEL, getCategoryColor, getWeeknightFriendlyColor, getWeeknightNotFriendlyColor } from '@/app/meals/meal-utils'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { MealFilterRack, WeeknightFilterOption } from '@/components/meal-filter-rack'

type Meal = {
  id: string
  name: string
  category: string
  weeknight_friendly: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  date: Date
  onMealAdded: () => void
}

export function AddMealModal({ open, onOpenChange, groupId, date, onMealAdded }: Props) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [selectedMealId, setSelectedMealId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [weeknightFilter, setWeeknightFilter] = useState<'all' | 'friendly' | 'not-friendly'>('all')

  useEffect(() => {
    if (!open || !groupId) return

    const fetchMeals = async () => {
      const { data, error } = await supabase
        .from('meals')
        .select('id, name, category, weeknight_friendly')
        .eq('group_id', groupId)
        .order('name')

      if (error) {
        toast.error('Failed to load meals')
        return
      }

      setMeals(data || [])
    }

    fetchMeals()
  }, [open, groupId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMealId) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('meal_calendar')
        .insert({
          meal_id: selectedMealId,
          group_id: groupId,
          date: date.toISOString().split('T')[0]
        })

      if (error) throw error

      toast.success('Meal added to calendar')
      onMealAdded()
      onOpenChange(false)
    } catch (error) {
      console.error('Error adding meal to calendar:', error)
      toast.error('Failed to add meal to calendar')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredMeals = meals.filter(meal => {
    const matchesName = meal.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || meal.category === selectedCategory
    const matchesWeeknight = weeknightFilter === 'all'
      || (weeknightFilter === 'friendly' && meal.weeknight_friendly)
      || (weeknightFilter === 'not-friendly' && !meal.weeknight_friendly)
    return matchesName && matchesCategory && matchesWeeknight
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Meal to {date.toLocaleDateString()}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 pt-1">
          <form id="add-meal-form" onSubmit={handleSubmit} className="space-y-4">
            <MealFilterRack
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              weeknightFilter={weeknightFilter}
              onWeeknightFilterChange={setWeeknightFilter}
              categoryOptions={Object.values(MEAL_CATEGORIES)}
              weeknightOptions={[
                { value: 'all', label: 'All meals' },
                { value: 'friendly', label: WEEKNIGHT_FRIENDLY_LABEL, activeClassName: getWeeknightFriendlyColor() },
                { value: 'not-friendly', label: 'Not weeknight friendly', activeClassName: getWeeknightNotFriendlyColor() },
              ] satisfies WeeknightFilterOption[]}
              className="bg-transparent p-0 shadow-none"
            />

            <div className="grid gap-4">
              {filteredMeals.map((meal) => (
                <div
                  key={meal.id}
                  className={`rounded-[10px] border border-border/60 bg-card p-3 cursor-pointer transition-colors hover:bg-surface-2/60 ${
                    selectedMealId === meal.id ? 'border-primary/50 bg-primary/5' : ''
                  }`}
                  onClick={() => setSelectedMealId(meal.id)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{meal.name}</h3>
                    {meal.category && (
                      <Chip className={cn("text-xs", getCategoryColor(meal.category as MealCategory))}>
                        {meal.category}
                      </Chip>
                    )}
                  </div>
                </div>
              ))}
              {filteredMeals.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No meals found matching &quot;{searchTerm}&quot;
                </p>
              )}
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-meal-form"
            disabled={!selectedMealId || isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Meal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 
