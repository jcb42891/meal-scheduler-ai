'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  MealCategory,
  WEEKNIGHT_FRIENDLY_LABEL,
  getCategoryColor,
  getWeeknightFriendlyColor,
  getWeeknightNotFriendlyColor,
} from './meal-utils'

type Meal = {
  id: string
  name: string
  description: string
  category: string
  weeknight_friendly: boolean
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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  meal: Meal | null
}

export function ViewMealDialog({ open, onOpenChange, meal }: Props) {
  const [ingredients, setIngredients] = useState<MealIngredient[]>([])

  useEffect(() => {
    if (!meal) {
      setIngredients([])
      return
    }

    const fetchMealIngredients = async () => {
      type DBIngredient = {
        quantity: number
        unit: string
        ingredient: { id: string; name: string }
      }

      const { data } = await supabase
        .from('meal_ingredients')
        .select(`
          quantity,
          unit,
          ingredient:ingredients(id, name)
        `)
        .eq('meal_id', meal.id)
        .returns<DBIngredient[]>()

      if (data) {
        setIngredients(
          data.map((item) => ({
            ingredient: item.ingredient,
            quantity: item.quantity,
            unit: item.unit,
          }))
        )
      }
    }

    fetchMealIngredients()
  }, [meal])

  const hasCategory = Boolean(meal?.category)
  const hasDescription = Boolean(meal?.description)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col w-full max-w-2xl mx-auto">
        <DialogHeader>
          <DialogTitle>View Meal</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <p className="text-sm font-medium text-foreground">{meal?.name}</p>
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {hasCategory ? (
                <Chip className={cn('text-xs', getCategoryColor(meal?.category as MealCategory))}>
                  {meal?.category}
                </Chip>
              ) : (
                <p className="text-sm text-muted-foreground">No category selected.</p>
              )}
              {meal?.weeknight_friendly ? (
                <Chip className={cn('text-xs', getWeeknightFriendlyColor())}>
                  {WEEKNIGHT_FRIENDLY_LABEL}
                </Chip>
              ) : (
                <Chip className={cn('text-xs', getWeeknightNotFriendlyColor())}>
                  Not weeknight friendly
                </Chip>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            {hasDescription ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{meal?.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description provided.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Ingredients</Label>
            {ingredients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ingredients added yet.</p>
            ) : (
              <div className="space-y-2">
                {ingredients.map((item) => (
                  <div
                    key={item.ingredient.id}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-border/60 bg-card p-2 text-sm"
                  >
                    <span className="font-medium">{item.ingredient.name}</span>
                    <span className="text-muted-foreground">
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
