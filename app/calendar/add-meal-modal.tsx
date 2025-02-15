'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'

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

  useEffect(() => {
    if (open && groupId) {
      fetchMeals()
    }
  }, [open, groupId])

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

  const filteredMeals = meals.filter(meal => 
    meal.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Meal to {date.toLocaleDateString()}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <form id="add-meal-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type="search"
                placeholder="Search meals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white/50 border-[#98C1B2]/30 focus:border-[#98C1B2] focus:ring-[#98C1B2]/20"
              />
            </div>

            <div className="grid gap-4">
              {filteredMeals.map((meal) => (
                <div
                  key={meal.id}
                  className={`p-3 rounded-lg border cursor-pointer hover:bg-[#98C1B2]/5 ${
                    selectedMealId === meal.id ? 'border-[#98C1B2] bg-[#98C1B2]/10' : 'border-[#98C1B2]/30'
                  }`}
                  onClick={() => setSelectedMealId(meal.id)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{meal.name}</h3>
                    {meal.category && (
                      <span className="text-xs px-2 py-1 rounded-full bg-[#98C1B2]/10 text-[#2F4F4F]">
                        {meal.category}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {filteredMeals.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No meals found matching "{searchTerm}"
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