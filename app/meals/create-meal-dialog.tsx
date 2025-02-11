'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/lib/contexts/AuthContext'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  onMealCreated: () => void
}

export function CreateMealDialog({ open, onOpenChange, groupId, onMealCreated }: Props) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !groupId) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('meals')
        .insert({
          name,
          description,
          category,
          group_id: groupId,
          created_by: user.id
        })

      if (error) throw error

      toast.success('Meal created successfully')
      onMealCreated()
      onOpenChange(false)
      // Reset form
      setName('')
      setDescription('')
      setCategory('')
    } catch (error) {
      console.error('Error creating meal:', error)
      toast.error('Failed to create meal')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Meal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Vegetarian, Chicken, Beef"
            />
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

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Meal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
} 