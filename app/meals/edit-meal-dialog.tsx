'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MEAL_CATEGORIES, MealCategory, getCategoryColor } from './meal-utils'

type Meal = {
  id: string
  name: string
  description: string
  category: string
  group_id: string
}

type Ingredient = {
  id: string
  name: string
}

type MealIngredient = {
  ingredient: Ingredient
  quantity: number
  unit: string
}

// Add this type to match Supabase's response
type MealIngredientResponse = {
  quantity: number
  unit: string
  ingredient: {
    id: string
    name: string
  }[]
}
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  meal: Meal | null
  onMealUpdated: () => void
}

export function EditMealDialog({ open, onOpenChange, meal, onMealUpdated }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selectedIngredients, setSelectedIngredients] = useState<MealIngredient[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(true)

  // Load meal data when opened
  useEffect(() => {
    if (meal) {
      setName(meal.name)
      setDescription(meal.description || '')
      setCategory(meal.category || '')
      fetchMealIngredients()
    }
  }, [meal])

  // Fetch ingredients for the meal
  const fetchMealIngredients = async () => {
    if (!meal) return

    type DBIngredient = {
      quantity: number
      unit: string
      ingredient: { id: string; name: string }
    }

    const { data, error } = await supabase
      .from('meal_ingredients')
      .select(`
        quantity,
        unit,
        ingredient:ingredients(id, name)
      `)
      .eq('meal_id', meal.id)
      .returns<DBIngredient[]>()

    if (!error && data) {
      const validIngredients = data.map(item => ({
        ingredient: item.ingredient,
        quantity: item.quantity,
        unit: item.unit
      }))
      setSelectedIngredients(validIngredients)
    }
  }

  // Load available ingredients
  useEffect(() => {
    const fetchIngredients = async () => {
      setIsLoadingIngredients(true)
      try {
        const { data, error } = await supabase
          .from('ingredients')
          .select('*')
          .order('name')

        if (!error) {
          setIngredients(data || [])
        }
      } finally {
        setIsLoadingIngredients(false)
      }
    }

    fetchIngredients()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!meal) return

    setIsSubmitting(true)
    try {
      // Update meal
      const { data: updatedMeal, error: mealError } = await supabase
        .from('meals')
        .update({
          name,
          description,
          category
        })
        .eq('id', meal.id)
        .select()

      if (mealError) {
        console.error('Error updating meal details:', mealError)
        throw mealError
      }

      console.log('Updated meal:', updatedMeal)

      // Get current ingredients
      const { data: currentIngredients } = await supabase
        .from('meal_ingredients')
        .select('ingredient_id, quantity, unit')
        .eq('meal_id', meal.id)

      // Determine which ingredients to update, add, or remove
      const toUpdate = selectedIngredients.filter(item => 
        currentIngredients?.some(ci => ci.ingredient_id === item.ingredient.id)
      )
      const toAdd = selectedIngredients.filter(item => 
        !currentIngredients?.some(ci => ci.ingredient_id === item.ingredient.id)
      )
      const toDelete = currentIngredients?.filter(ci => 
        !selectedIngredients.some(si => si.ingredient.id === ci.ingredient_id)
      ) || []

      // Update existing ingredients
      for (const item of toUpdate) {
        const { error } = await supabase
          .from('meal_ingredients')
          .update({
            quantity: item.quantity,
            unit: item.unit
          })
          .eq('meal_id', meal.id)
          .eq('ingredient_id', item.ingredient.id)

        if (error) throw error
      }

      // Add new ingredients
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('meal_ingredients')
          .insert(
            toAdd.map(item => ({
              meal_id: meal.id,
              ingredient_id: item.ingredient.id,
              quantity: item.quantity,
              unit: item.unit
            }))
          )

        if (error) throw error
      }

      // Delete removed ingredients
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('meal_ingredients')
          .delete()
          .eq('meal_id', meal.id)
          .in('ingredient_id', toDelete.map(i => i.ingredient_id))

        if (error) throw error
      }

      toast.success('Meal updated successfully')
      onMealUpdated()
      onOpenChange(false)
    } catch (error) {
      console.error('Error updating meal:', error)
      toast.error('Failed to update meal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddIngredient = async () => {
    if (!searchTerm) return
    
    // Check if ingredient exists
    const existingIngredient = ingredients.find(
      i => i.name.toLowerCase() === searchTerm.toLowerCase()
    )

    if (existingIngredient) {
      setSelectedIngredients([
        ...selectedIngredients,
        { ingredient: existingIngredient, quantity: 1, unit: 'unit' }
      ])
    } else {
      // Create new ingredient
      const { data, error } = await supabase
        .from('ingredients')
        .insert({ name: searchTerm })
        .select()
        .single()

      if (!error && data) {
        setIngredients([...ingredients, data])
        setSelectedIngredients([
          ...selectedIngredients,
          { ingredient: data, quantity: 1, unit: 'unit' }
        ])
      }
    }
    setSearchTerm('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col w-full max-w-2xl mx-auto">
        <DialogHeader>
          <DialogTitle>Edit Meal</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2">
          <form id="edit-meal-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-white/50 border-[#98C1B2]/30 focus:border-[#98C1B2] focus:ring-[#98C1B2]/20"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {Object.values(MEAL_CATEGORIES).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap',
                      category === cat 
                        ? getCategoryColor(cat as MealCategory)
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="bg-white/50 border-[#98C1B2]/30 focus:border-[#98C1B2] focus:ring-[#98C1B2]/20"
              />
            </div>

            <div className="space-y-4">
              <Label>Ingredients</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Search or add new ingredient"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white/50 border-[#98C1B2]/30 focus:border-[#98C1B2] focus:ring-[#98C1B2]/20"
                  />
                </div>
                <Button type="button" onClick={handleAddIngredient} className="w-full sm:w-auto">
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {selectedIngredients?.map((item, index) => (
                  <div key={item?.ingredient?.id || index} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 border rounded">
                    <span className="font-medium flex-1">{item?.ingredient?.name}</span>
                    <div className="flex flex-wrap sm:flex-nowrap items-end gap-2 w-full sm:w-auto">
                      <div className="w-20">
                        <Label htmlFor={`quantity-${item?.ingredient?.id}`} className="text-xs">
                          Quantity
                        </Label>
                        <Input
                          id={`quantity-${item?.ingredient?.id}`}
                          type="number"
                          value={item?.quantity || ''}
                          onChange={(e) => {
                            const newIngredients = [...selectedIngredients]
                            newIngredients[index].quantity = e.target.value === '' ? 0 : parseFloat(e.target.value)
                            setSelectedIngredients(newIngredients)
                          }}
                          className="w-full bg-white/50 border-[#98C1B2]/30 focus:border-[#98C1B2] focus:ring-[#98C1B2]/20"
                          min="0"
                          step="0.1"
                        />
                      </div>
                      <div className="w-24">
                        <Label htmlFor={`unit-${item?.ingredient?.id}`} className="text-xs">
                          Unit
                        </Label>
                        <select
                          id={`unit-${item?.ingredient?.id}`}
                          value={item?.unit}
                          onChange={(e) => {
                            const newIngredients = [...selectedIngredients]
                            newIngredients[index].unit = e.target.value
                            setSelectedIngredients(newIngredients)
                          }}
                          className="h-10 w-full rounded-md border border-[#98C1B2]/30 bg-white/50 px-3 text-sm focus:border-[#98C1B2] focus:ring-[#98C1B2]/20"
                        >
                          <option value="unit">unit</option>
                          <option value="oz">oz</option>
                          <option value="g">grams</option>
                          <option value="kg">kilograms</option>
                          <option value="ml">milliliters</option>
                          <option value="l">liters</option>
                          <option value="tbsp">tablespoons</option>
                          <option value="tsp">teaspoons</option>
                          <option value="cup">cups</option>
                        </select>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedIngredients(
                            selectedIngredients.filter((_, i) => i !== index)
                          )
                        }}
                        className="text-destructive hover:text-destructive/90"
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
          <Button type="submit" form="edit-meal-form" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update Meal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 