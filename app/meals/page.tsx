'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { CreateMealDialog } from './create-meal-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Trash2, Pencil } from 'lucide-react'
import { EditMealDialog } from './edit-meal-dialog'
import { cn } from '@/lib/utils'
import { MEAL_CATEGORIES, MealCategory, getCategoryColor } from './meal-utils'

type Meal = {
  id: string
  name: string
  description: string
  category: string
  group_id: string
}

export default function MealsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [userGroups, setUserGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [mealToEdit, setMealToEdit] = useState<Meal | null>(null)

  useEffect(() => {
    if (!user) {
      router.push('/auth')
      return
    }
    fetchUserGroups()
    fetchMeals()
  }, [user, router, selectedGroupId])

  const fetchUserGroups = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get groups where user is owner
    const { data: ownedGroups, error: ownedError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('owner_id', user.id)

    if (ownedError) {
      console.error('Error fetching owned groups:', ownedError)
      toast.error('Failed to load groups')
      return
    }

    // Get groups where user is member
    const { data: memberGroups, error: memberError } = await supabase
      .from('group_members')
      .select('group:groups(id, name)')
      .eq('user_id', user.id)

    if (memberError) {
      console.error('Error fetching member groups:', memberError)
      toast.error('Failed to load groups')
      return
    }

    // Combine and deduplicate groups
    const allGroups = [
      ...ownedGroups,
      ...memberGroups.map(m => m.group)
    ].filter((group, index, self) => 
      index === self.findIndex((g) => g.id === group.id)
    )

    setUserGroups(allGroups || [])
    if (allGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(allGroups[0].id)
    }
  }

  const fetchMeals = async () => {
    if (!selectedGroupId) return

    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('group_id', selectedGroupId)
      .order('name')

    if (error) {
      toast.error('Failed to load meals')
      return
    }

    setMeals(data || [])
    setLoading(false)
  }

  const handleDeleteMeal = async () => {
    if (!mealToDelete) return
    
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('meals')
        .delete()
        .eq('id', mealToDelete.id)

      if (error) throw error

      toast.success('Meal deleted successfully')
      fetchMeals()
    } catch (error) {
      console.error('Error deleting meal:', error)
      toast.error('Failed to delete meal')
    } finally {
      setIsDeleting(false)
      setMealToDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Meals</h1>
        <div className="flex items-center gap-4">
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="h-10 w-[200px] rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select a group</option>
            {userGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <Button onClick={() => setShowCreateDialog(true)}>Create Meal</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Your Meals</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading meals...</p>
          ) : meals.length === 0 && selectedGroupId ? (
            <p className="text-muted-foreground">No meals have been created for this group yet.</p>
          ) : !selectedGroupId ? (
            <p className="text-muted-foreground">Select a group to view meals</p>
          ) : (
            <div className="space-y-4">
              {meals.map((meal) => (
                <div
                  key={meal.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <h3 className="font-medium">{meal.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {meal.description}
                    </p>
                    {meal.category && (
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
                        getCategoryColor(meal.category as MealCategory)
                      )}>
                        {meal.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMealToEdit(meal)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMealToDelete(meal)}
                      className="text-destructive hover:text-destructive/90"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateMealDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        groupId={selectedGroupId}
        onMealCreated={fetchMeals}
      />

      <EditMealDialog
        open={!!mealToEdit}
        onOpenChange={(open) => !open && setMealToEdit(null)}
        meal={mealToEdit}
        onMealUpdated={fetchMeals}
      />

      <AlertDialog open={!!mealToDelete} onOpenChange={(open) => !open && setMealToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the meal "{mealToDelete?.name}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMeal}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
} 