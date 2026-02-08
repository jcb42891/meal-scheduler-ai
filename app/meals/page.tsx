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
import { Eye, Trash2, Pencil } from 'lucide-react'
import { EditMealDialog } from './edit-meal-dialog'
import { ViewMealDialog } from './view-meal-dialog'
import { MagicRecipeImportDialog } from './magic-recipe-import-dialog'
import { cn } from '@/lib/utils'
import { MEAL_CATEGORIES, MealCategory, WEEKNIGHT_FRIENDLY_LABEL, getCategoryColor, getWeeknightFriendlyColor, getWeeknightNotFriendlyColor } from './meal-utils'
import { MealFilterRack, WeeknightFilterOption } from '@/components/meal-filter-rack'

type Group = {
  id: string
  name: string
}

type Meal = {
  id: string
  name: string
  description: string
  category: string
  weeknight_friendly: boolean
  group_id: string
}

export default function MealsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showMagicImportDialog, setShowMagicImportDialog] = useState(false)
  const [userGroups, setUserGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [mealToEdit, setMealToEdit] = useState<Meal | null>(null)
  const [mealToView, setMealToView] = useState<Meal | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [weeknightFilter, setWeeknightFilter] = useState<'all' | 'friendly' | 'not-friendly'>('all')
  const [selectedMealIds, setSelectedMealIds] = useState<Set<string>>(new Set())

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

  useEffect(() => {
    setSelectedMealIds(new Set())
  }, [selectedGroupId])

  useEffect(() => {
    setSelectedMealIds((prev) => {
      if (prev.size === 0) return prev
      const validIds = new Set(meals.map((meal) => meal.id))
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [meals])

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
    const matchesCategory = selectedCategory === 'all' || meal.category === selectedCategory
    const matchesWeeknight = weeknightFilter === 'all'
      || (weeknightFilter === 'friendly' && meal.weeknight_friendly)
      || (weeknightFilter === 'not-friendly' && !meal.weeknight_friendly)
    return matchesSearch && matchesCategory && matchesWeeknight
  })

  const handleToggleMealSelection = (mealId: string) => {
    setSelectedMealIds((prev) => {
      const next = new Set(prev)
      if (next.has(mealId)) {
        next.delete(mealId)
      } else {
        next.add(mealId)
      }
      return next
    })
  }

  const handleGenerateOneOffList = () => {
    if (!selectedGroupId) {
      toast.error('Select a group first')
      return
    }
    if (selectedMealIds.size === 0) {
      toast.error('Select at least one meal')
      return
    }

    const params = new URLSearchParams({
      source: 'meals',
      groupId: selectedGroupId,
      mealIds: Array.from(selectedMealIds).join(','),
    })
    const url = `/grocery-list?${params.toString()}`
    const nextWindow = window.open(url, '_blank', 'noopener,noreferrer')
    if (!nextWindow) {
      toast.error('Pop-up blocked. Please allow pop-ups for this site.')
      return
    }
    try {
      nextWindow.focus()
    } catch {
    }
  }

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
          <Button
            onClick={() => setShowMagicImportDialog(true)}
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={!selectedGroupId}
          >
            Magic Import
          </Button>
          <Button
            onClick={handleGenerateOneOffList}
            className="w-full sm:w-auto"
            disabled={!selectedGroupId || selectedMealIds.size === 0}
          >
            Build Grocery List ({selectedMealIds.size})
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Your Meals</h2>
          </div>
          <MealFilterRack
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            weeknightFilter={weeknightFilter}
            onWeeknightFilterChange={setWeeknightFilter}
            categoryOptions={Object.values(MEAL_CATEGORIES)}
            weeknightOptions={[
              { value: 'all', label: 'All meals' },
              { value: 'friendly', label: WEEKNIGHT_FRIENDLY_LABEL, activeClassName: getWeeknightFriendlyColor() },
              { value: 'not-friendly', label: 'Not weeknight friendly', activeClassName: getWeeknightNotFriendlyColor() },
            ] satisfies WeeknightFilterOption[]}
          />
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
                {searchTerm && selectedCategory !== 'all' ? (
                  <>
                    No meals found matching &quot;{searchTerm}&quot; in {selectedCategory}.
                  </>
                ) : searchTerm ? (
                  <>No meals found matching &quot;{searchTerm}&quot;.</>
                ) : selectedCategory !== 'all' ? (
                  <>No meals found in {selectedCategory}.</>
                ) : (
                  'No meals have been created for this group yet.'
                )}
              </p>
              {!searchTerm && selectedCategory === 'all' && (
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
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedMealIds.has(meal.id)}
                        onChange={() => handleToggleMealSelection(meal.id)}
                        className="mt-1 h-4 w-4 accent-primary"
                        aria-label={`Select ${meal.name} for grocery list`}
                      />
                      <div className="space-y-1">
                      <h3 className="text-base font-medium">{meal.name}</h3>
                      {meal.description && (
                        <p className="text-sm text-muted-foreground sm:max-w-md truncate">
                          {meal.description}
                        </p>
                      )}
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                      {meal.category && (
                        <Chip className={cn("text-xs", getCategoryColor(meal.category as MealCategory))}>
                          {meal.category}
                        </Chip>
                      )}
                      {meal.weeknight_friendly && (
                        <Chip className={cn("text-xs", getWeeknightFriendlyColor())}>
                          {WEEKNIGHT_FRIENDLY_LABEL}
                        </Chip>
                      )}
                      <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <IconButton
                          aria-label={`View ${meal.name}`}
                          onClick={() => setMealToView(meal)}
                        >
                          <Eye className="h-4 w-4" />
                        </IconButton>
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

      <MagicRecipeImportDialog
        open={showMagicImportDialog}
        onOpenChange={setShowMagicImportDialog}
        groupId={selectedGroupId}
        onMealImported={fetchMeals}
      />

      <EditMealDialog
        open={!!mealToEdit}
        onOpenChange={(open) => !open && setMealToEdit(null)}
        meal={mealToEdit}
        onMealUpdated={fetchMeals}
      />

      <ViewMealDialog
        open={!!mealToView}
        onOpenChange={(open) => !open && setMealToView(null)}
        meal={mealToView}
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
