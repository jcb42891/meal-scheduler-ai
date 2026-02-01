'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { MEAL_CATEGORIES, MealCategory, getCategoryColor } from '@/app/meals/meal-utils'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

type Meal = {
  id: string
  name: string
  category: string
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

  useEffect(() => {
    if (!open || !groupId) return

    const fetchMeals = async () => {
      const { data, error } = await supabase
        .from('meals')
        .select('id, name, category')
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
    return matchesName && matchesCategory
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Meal to {date.toLocaleDateString()}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <form id="add-meal-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-center">
              <Input
                type="search"
                placeholder="Search meals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {Object.values(MEAL_CATEGORIES).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
