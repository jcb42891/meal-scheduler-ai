'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Chip } from '@/components/ui/chip'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
} from '@/components/ui/alert-dialog'
import { ChevronLeft, ChevronRight, Eye, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { EditMealDialog } from './edit-meal-dialog'
import { ViewMealDialog } from './view-meal-dialog'
import { MagicRecipeImportDialog } from './magic-recipe-import-dialog'
import { cn } from '@/lib/utils'
import {
  MEAL_CATEGORIES,
  MealCategory,
  WEEKNIGHT_FRIENDLY_LABEL,
  getCategoryColor,
  getWeeknightFriendlyColor,
  getWeeknightNotFriendlyColor,
} from './meal-utils'
import { MealFilterRack, WeeknightFilterOption } from '@/components/meal-filter-rack'
import { PageHeader } from '@/components/page-header'

const MEALS_PER_PAGE = 12

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
  const [currentPage, setCurrentPage] = useState(1)

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

    const { data: ownedGroups, error: ownedError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('owner_id', user.id)

    if (ownedError) {
      console.error('Error fetching owned groups:', ownedError)
      toast.error('Failed to load groups')
      return
    }

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

    const allGroups = [
      ...ownedGroups,
      ...memberGroups.map((member) => ({
        id: member.group.id,
        name: member.group.name,
      })),
    ].filter((group, index, self) =>
      index === self.findIndex((item) => item.id === group.id)
    )

    setUserGroups(allGroups || [])
    if (allGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(allGroups[0].id)
    }
  }

  const fetchMeals = async () => {
    if (!selectedGroupId) {
      setMeals([])
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('group_id', selectedGroupId)
      .order('name')

    if (error) {
      toast.error('Failed to load meals')
      setLoading(false)
      return
    }

    setMeals(data || [])
    setLoading(false)
  }

  useEffect(() => {
    setSelectedMealIds(new Set())
  }, [selectedGroupId])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedGroupId, searchTerm, selectedCategory, weeknightFilter])

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

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const searchableMeals = meals.filter((meal) => {
    const matchesSearch = meal.name.toLowerCase().includes(normalizedSearchTerm)
    const matchesWeeknight = weeknightFilter === 'all'
      || (weeknightFilter === 'friendly' && meal.weeknight_friendly)
      || (weeknightFilter === 'not-friendly' && !meal.weeknight_friendly)

    return matchesSearch && matchesWeeknight
  })

  const filteredMeals = searchableMeals.filter((meal) => {
    return selectedCategory === 'all' || meal.category === selectedCategory
  })

  const categoryQuickFilters = [
    { value: 'all', label: 'All meals', count: searchableMeals.length },
    ...Object.values(MEAL_CATEGORIES).map((category) => ({
      value: category,
      label: category,
      count: searchableMeals.filter((meal) => meal.category === category).length,
    })),
  ]

  const totalPages = Math.max(1, Math.ceil(filteredMeals.length / MEALS_PER_PAGE))

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const startIndex = (currentPage - 1) * MEALS_PER_PAGE
  const paginatedMeals = filteredMeals.slice(startIndex, startIndex + MEALS_PER_PAGE)
  const showingStart = filteredMeals.length === 0 ? 0 : startIndex + 1
  const showingEnd = Math.min(filteredMeals.length, startIndex + MEALS_PER_PAGE)

  const hasActiveFilters =
    normalizedSearchTerm.length > 0
    || selectedCategory !== 'all'
    || weeknightFilter !== 'all'

  const emptyStateMessage = hasActiveFilters
    ? 'No meals match your current filters. Try widening your search or clearing a filter.'
    : 'No meals have been created for this group yet.'

  const selectedCategoryLabel = selectedCategory === 'all'
    ? 'all categories'
    : selectedCategory

  const handleClearFilters = () => {
    setSearchTerm('')
    setSelectedCategory('all')
    setWeeknightFilter('all')
  }

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

  const selectedMealCount = selectedMealIds.size

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meal Library"
        description="Browse and manage meals for your household."
        actions={
          <>
            <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
              Create Meal
            </Button>
            <Button
              onClick={() => setShowMagicImportDialog(true)}
              variant="secondary"
              className="w-full sm:w-auto border-accent/40 bg-accent/85 text-accent-foreground hover:bg-accent"
              disabled={!selectedGroupId}
            >
              <Sparkles className="h-4 w-4" />
              Magic Import
            </Button>
          </>
        }
        context={
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:w-[260px]"
          >
            <option value="">Select a group</option>
            {userGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        }
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedMealCount > 0
                ? `${selectedMealCount} meal${selectedMealCount === 1 ? '' : 's'} selected for one-off grocery list.`
                : 'Select meals from the library below to build a one-off grocery list.'}
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              {selectedMealCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  onClick={() => setSelectedMealIds(new Set())}
                >
                  Clear
                </Button>
              )}
              <Button
                onClick={handleGenerateOneOffList}
                className="w-full sm:w-auto"
                disabled={!selectedGroupId || selectedMealCount === 0}
              >
                Build Grocery List{selectedMealCount > 0 ? ` (${selectedMealCount})` : ''}
              </Button>
            </div>
          </div>
        }
      />

      <Card>
        <CardHeader className="space-y-4 pb-4">
          <h2 className="text-lg font-semibold">Your Meals</h2>
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
              {
                value: 'friendly',
                label: WEEKNIGHT_FRIENDLY_LABEL,
                activeClassName: getWeeknightFriendlyColor(),
              },
              {
                value: 'not-friendly',
                label: 'Not weeknight friendly',
                activeClassName: getWeeknightNotFriendlyColor(),
              },
            ] satisfies WeeknightFilterOption[]}
          />

          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quick Browse
              </p>
              {selectedCategory !== 'all' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategory('all')}
                  className="h-7 justify-start px-0 text-xs sm:h-8 sm:px-2"
                >
                  Clear category filter
                </Button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categoryQuickFilters.map((filter) => {
                const isActive = selectedCategory === filter.value
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setSelectedCategory(filter.value)}
                    className={cn(
                      'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isActive
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-border/70 bg-surface-2/60 text-foreground hover:bg-surface-2'
                    )}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[11px]',
                        isActive ? 'bg-primary/15 text-primary' : 'bg-background text-muted-foreground'
                      )}
                    >
                      {filter.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="h-4 w-40 animate-pulse rounded-full bg-surface-2" />
                      <div className="h-3 w-full animate-pulse rounded-full bg-surface-2" />
                    </div>
                    <div className="h-6 w-24 animate-pulse rounded-full bg-surface-2" />
                    <div className="h-8 w-28 animate-pulse rounded-md bg-surface-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMeals.length === 0 && selectedGroupId ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
              {hasActiveFilters ? (
                <Button onClick={handleClearFilters} variant="outline" className="mt-4">
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                  Create Meal
                </Button>
              )}
            </div>
          ) : !selectedGroupId ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center text-sm text-muted-foreground shadow-sm">
              Select a group to view meals.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{showingStart}-{showingEnd}</span> of{' '}
                  <span className="font-semibold text-foreground">{filteredMeals.length}</span>{' '}
                  meal{filteredMeals.length === 1 ? '' : 's'} in{' '}
                  <span className="font-semibold text-foreground">{selectedCategoryLabel}</span>.
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    <span className="text-xs font-medium text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {paginatedMeals.map((meal) => {
                  const isSelected = selectedMealIds.has(meal.id)

                  return (
                    <article
                      key={meal.id}
                      className={cn(
                        'group flex h-full flex-col justify-between rounded-xl border p-4 shadow-sm transition-all',
                        isSelected
                          ? 'border-primary/60 bg-primary/5 shadow-md'
                          : 'border-border/60 bg-card hover:bg-surface-2/60 hover:shadow-md focus-within:shadow-md'
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex flex-1 cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleMealSelection(meal.id)}
                              className="mt-1 h-4 w-4 accent-primary"
                              aria-label={`Select ${meal.name} for grocery list`}
                            />
                            <div className="space-y-1">
                              <h3 className="text-base font-semibold leading-tight">{meal.name}</h3>
                              {meal.description ? (
                                <p className="max-h-10 overflow-hidden text-sm text-muted-foreground">
                                  {meal.description}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">No description yet.</p>
                              )}
                            </div>
                          </label>
                          {isSelected && (
                            <Chip className="border-primary/20 bg-primary/10 text-primary">
                              Selected
                            </Chip>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {meal.category ? (
                            <Chip className={cn('text-xs', getCategoryColor(meal.category as MealCategory))}>
                              {meal.category}
                            </Chip>
                          ) : (
                            <Chip className="text-xs text-muted-foreground">Uncategorized</Chip>
                          )}
                          {meal.weeknight_friendly ? (
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

                      <div className="mt-4 flex items-center justify-end gap-1 border-t border-border/60 pt-3">
                        <IconButton aria-label={`View ${meal.name}`} onClick={() => setMealToView(meal)}>
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        <IconButton aria-label={`Edit ${meal.name}`} onClick={() => setMealToEdit(meal)}>
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
                    </article>
                  )
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                    <span>{currentPage}</span>
                    <span>/</span>
                    <span>{totalPages} pages</span>
                  </div>
                </div>
              )}
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
