'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  startDate: Date
  endDate: Date
}

type IngredientTotal = {
  name: string
  total: number
  unit: string
}

export function GroceryListModal({ open, onOpenChange, groupId, startDate, endDate }: Props) {
  const [ingredients, setIngredients] = useState<Record<string, IngredientTotal>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (open) {
      fetchIngredients()
    }
  }, [open, groupId, startDate, endDate])

  const fetchIngredients = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('meal_calendar')
        .select(`
          meal:meals(
            meal_ingredients(
              quantity,
              unit,
              ingredient:ingredients(name)
            )
          )
        `)
        .eq('group_id', groupId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])

      if (error) throw error

      // Aggregate ingredients
      const totals: Record<string, IngredientTotal> = {}
      data.forEach(entry => {
        entry.meal.meal_ingredients.forEach((mi: any) => {
          const key = `${mi.ingredient.name}-${mi.unit}`
          if (!totals[key]) {
            totals[key] = {
              name: mi.ingredient.name,
              total: 0,
              unit: mi.unit
            }
          }
          totals[key].total += mi.quantity
        })
      })

      setIngredients(totals)
    } catch (error) {
      console.error('Error fetching ingredients:', error)
      toast.error('Failed to generate grocery list')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = () => {
    const text = Object.values(ingredients)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => `${i.name}: ${i.total} ${i.unit}`)
      .join('\n')

    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grocery List</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground">Generating list...</p>
          ) : (
            <>
              <div className="space-y-2">
                {Object.values(ingredients)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((ingredient) => (
                    <div
                      key={`${ingredient.name}-${ingredient.unit}`}
                      className="flex justify-between items-center"
                    >
                      <span>{ingredient.name}</span>
                      <span className="text-muted-foreground">
                        {ingredient.total} {ingredient.unit}
                      </span>
                    </div>
                  ))}
              </div>
              <div className="flex justify-end">
                <Button onClick={copyToClipboard}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 