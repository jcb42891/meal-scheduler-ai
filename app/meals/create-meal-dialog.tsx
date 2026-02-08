'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/lib/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { MEAL_CATEGORIES, MealCategory, WEEKNIGHT_FRIENDLY_LABEL, getCategoryColor, getWeeknightFriendlyColor, getWeeknightNotFriendlyColor } from './meal-utils'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  onMealCreated: () => void
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

export function CreateMealDialog({ open, onOpenChange, groupId, onMealCreated }: Props) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [weeknightFriendly, setWeeknightFriendly] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selectedIngredients, setSelectedIngredients] = useState<MealIngredient[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !groupId) return

    setIsSubmitting(true)
    try {
      // Create meal
      const { data: meal, error: mealError } = await supabase
        .from('meals')
        .insert({
          name,
          description,
          category,
          weeknight_friendly: weeknightFriendly,
          group_id: groupId,
          created_by: user.id
        })
        .select()
        .single()

      if (mealError) throw mealError

      // Add ingredients
      if (selectedIngredients.length > 0) {
        const { error: ingredientsError } = await supabase
          .from('meal_ingredients')
          .insert(
            selectedIngredients.map(item => ({
              meal_id: meal.id,
              ingredient_id: item.ingredient.id,
              quantity: item.quantity,
              unit: item.unit
            }))
          )

        if (ingredientsError) throw ingredientsError
      }

      toast.success('Meal created successfully')
      onMealCreated()
      onOpenChange(false)
      // Reset form
      setName('')
      setDescription('')
      setCategory('')
      setWeeknightFriendly(false)
      setSelectedIngredients([])
    } catch (error) {
      console.error('Error creating meal:', error)
      toast.error('Failed to create meal')
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const fetchIngredients = async () => {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .order('name')

      if (!error) {
        setIngredients(data)
      }
    }

    fetchIngredients()
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col w-full max-w-2xl mx-auto">
        <DialogHeader>
          <DialogTitle>Create New Meal</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pl-1 pr-2">
          <form id="create-meal-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
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
                      'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      category === cat 
                        ? getCategoryColor(cat as MealCategory)
                        : 'bg-surface-2 text-muted-foreground hover:bg-surface-2/80'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Weeknight friendly</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWeeknightFriendly(true)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    weeknightFriendly
                      ? getWeeknightFriendlyColor()
                      : 'bg-surface-2 text-muted-foreground hover:bg-surface-2/80'
                  )}
                >
                  {WEEKNIGHT_FRIENDLY_LABEL}
                </button>
                <button
                  type="button"
                  onClick={() => setWeeknightFriendly(false)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    !weeknightFriendly
                      ? getWeeknightNotFriendlyColor()
                      : 'bg-surface-2 text-muted-foreground hover:bg-surface-2/80'
                  )}
                >
                  Not weeknight friendly
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
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
                    className="w-full"
                  />
                </div>
                <Button type="button" onClick={async () => {
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
                }} className="w-full sm:w-auto">
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {selectedIngredients.map((item, index) => (
                  <div key={item.ingredient.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 rounded-[10px] border border-border/60 bg-card p-2">
                    <span className="font-medium flex-1">{item.ingredient.name}</span>
                    <div className="flex flex-wrap sm:flex-nowrap items-end gap-2 w-full sm:w-auto">
                      <div className="w-20">
                        <Label htmlFor={`quantity-${item.ingredient.id}`} className="text-xs">
                          Quantity
                        </Label>
                        <Input
                          id={`quantity-${item.ingredient.id}`}
                          type="number"
                          value={item.quantity || ''}
                          onChange={(e) => {
                            const newIngredients = [...selectedIngredients]
                            newIngredients[index].quantity = e.target.value === '' ? 0 : parseFloat(e.target.value)
                            setSelectedIngredients(newIngredients)
                          }}
                          className="w-full"
                          min="0"
                          step="0.1"
                        />
                      </div>
                      <div className="w-24">
                        <Label htmlFor={`unit-${item.ingredient.id}`} className="text-xs">
                          Unit
                        </Label>
                        <select
                          id={`unit-${item.ingredient.id}`}
                          value={item.unit}
                          onChange={(e) => {
                            const newIngredients = [...selectedIngredients]
                            newIngredients[index].unit = e.target.value
                            setSelectedIngredients(newIngredients)
                          }}
                          className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
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
                      <IconButton
                        aria-label={`Remove ${item.ingredient.name}`}
                        variant="destructive"
                        onClick={() => {
                          setSelectedIngredients(
                            selectedIngredients.filter((_, i) => i !== index)
                          )
                        }}
                      >
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-meal-form" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Meal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 
