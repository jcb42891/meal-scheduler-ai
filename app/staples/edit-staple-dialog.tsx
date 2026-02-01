'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { STAPLE_UNITS, StapleUnit } from './staple-utils'

type StapleIngredient = {
  id: string
  name: string
  category: string | null
  quantity: number
  unit: string
  group_id: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  staple: StapleIngredient | null
  onStapleUpdated: () => void
}

export function EditStapleDialog({ open, onOpenChange, staple, onStapleUpdated }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState<StapleUnit>('unit')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!staple) return
    setName(staple.name)
    setCategory(staple.category ?? '')
    setQuantity(String(staple.quantity ?? 1))
    setUnit((staple.unit as StapleUnit) ?? 'unit')
  }, [staple])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staple) return

    const parsedQuantity = Number.parseFloat(quantity)
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('staple_ingredients')
        .update({
          name,
          category: category || null,
          quantity: parsedQuantity,
          unit,
        })
        .eq('id', staple.id)

      if (error) throw error

      toast.success('Staple ingredient updated')
      onStapleUpdated()
      onOpenChange(false)
    } catch (error) {
      console.error('Error updating staple ingredient:', error)
      toast.error('Failed to update staple ingredient')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col w-full max-w-xl mx-auto">
        <DialogHeader>
          <DialogTitle>Edit Staple Ingredient</DialogTitle>
        </DialogHeader>

        <form id="edit-staple-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-staple-name">Name</Label>
            <Input
              id="edit-staple-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-staple-category">Category</Label>
            <Input
              id="edit-staple-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-2">
              <Label htmlFor="edit-staple-quantity">Quantity</Label>
              <Input
                id="edit-staple-quantity"
                type="number"
                min="0"
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-staple-unit">Unit</Label>
              <select
                id="edit-staple-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as StapleUnit)}
                className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              >
                {STAPLE_UNITS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-staple-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
