'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Chip } from '@/components/ui/chip'
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
import { Trash2, Pencil, Search } from 'lucide-react'
import { EditMealDialog } from './edit-meal-dialog'
import { cn } from '@/lib/utils'
import { MEAL_CATEGORIES, MealCategory, getCategoryColor } from './meal-utils'
import { Input } from '@/components/ui/input'

type Group = {
  id: string
  name: string
}

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
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

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
      .returns<{ group: Group }[]>()

    if (memberError) {
      console.error('Error fetching member groups:', memberError)
      toast.error('Failed to load groups')
      return
    }

    // Combine and deduplicate groups
    const allGroups = [
      ...ownedGroups,
      ...memberGroups.map(m => ({
        id: m.group.id,
        name: m.group.name
      }))
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

  const filteredMeals = meals.filter(meal => {
    const matchesSearch = meal.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || meal.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meal Library</h1>
          <p className="text-sm text-muted-foreground">Browse and manage meals for your household.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="h-10 w-full sm:w-[220px] rounded-[10px] border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            <option value="">Select a group</option>
            {userGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
            Create Meal
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Your Meals</h2>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search meals..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:w-48"
              >
                <option value="">All categories</option>
                {Object.values(MEAL_CATEGORIES).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-border/60 bg-card p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-40 rounded-full bg-surface-2 animate-pulse" />
                      <div className="h-3 w-64 rounded-full bg-surface-2 animate-pulse" />
                    </div>
                    <div className="h-6 w-16 rounded-full bg-surface-2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMeals.length === 0 && selectedGroupId ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                {searchTerm && selectedCategory ? (
                  <>
                    No meals found matching &quot;{searchTerm}&quot; in {selectedCategory}.
                  </>
                ) : searchTerm ? (
                  <>No meals found matching &quot;{searchTerm}&quot;.</>
                ) : selectedCategory ? (
                  <>No meals found in {selectedCategory}.</>
                ) : (
                  'No meals have been created for this group yet.'
                )}
              </p>
              {!searchTerm && !selectedCategory && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="mt-4"
                >
                  Create Meal
                </Button>
              )}
            </div>
          ) : !selectedGroupId ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center text-sm text-muted-foreground shadow-sm">
              Select a group to view meals.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMeals.map((meal) => (
                <div
                  key={meal.id}
                  className="group rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-colors hover:bg-surface-2/60 hover:shadow-md focus-within:shadow-md"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-medium">{meal.name}</h3>
                      {meal.description && (
                        <p className="text-sm text-muted-foreground sm:max-w-md truncate">
                          {meal.description}
                        </p>
                      )}
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                      {meal.category && (
                        <Chip className={cn("text-xs", getCategoryColor(meal.category as MealCategory))}>
                          {meal.category}
                        </Chip>
                      )}
                      <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <IconButton
                          aria-label={`Edit ${meal.name}`}
                          onClick={() => setMealToEdit(meal)}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          aria-label={`Delete ${meal.name}`}
                          variant="destructive"
                          onClick={() => setMealToDelete(meal)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
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
              This will permanently delete the meal &quot;{mealToDelete?.name}&quot;.
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
