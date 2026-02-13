'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Chip } from '@/components/ui/chip'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { CreateStapleDialog } from './create-staple-dialog'
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
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { EditStapleDialog } from './edit-staple-dialog'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'

const STAPLES_PER_PAGE = 12
const UNCATEGORIZED_FILTER_VALUE = 'uncategorized'

type Group = {
  id: string
  name: string
}

type StapleIngredient = {
  id: string
  name: string
  category: string | null
  quantity: number
  unit: string
  group_id: string
}

const normalizeCategory = (category: string | null) => {
  const trimmedCategory = category?.trim()
  return trimmedCategory && trimmedCategory.length > 0 ? trimmedCategory : null
}

export default function StaplesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [staples, setStaples] = useState<StapleIngredient[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [userGroups, setUserGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [stapleToDelete, setStapleToDelete] = useState<StapleIngredient | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [stapleToEdit, setStapleToEdit] = useState<StapleIngredient | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (!user) {
      router.push('/auth')
      return
    }
    fetchUserGroups()
  }, [user, router])

  useEffect(() => {
    if (!selectedGroupId) {
      setStaples([])
      setLoading(false)
      return
    }
    fetchStaples()
  }, [selectedGroupId])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedGroupId, searchTerm, selectedCategory])

  const fetchUserGroups = async () => {
    const { data: { user: sessionUser } } = await supabase.auth.getUser()
    if (!sessionUser) return

    const { data: ownedGroups, error: ownedError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('owner_id', sessionUser.id)

    if (ownedError) {
      console.error('Error fetching owned groups:', ownedError)
      toast.error('Failed to load groups')
      return
    }

    const { data: memberGroups, error: memberError } = await supabase
      .from('group_members')
      .select('group:groups(id, name)')
      .eq('user_id', sessionUser.id)
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

  const fetchStaples = async () => {
    if (!selectedGroupId) return

    setLoading(true)
    const { data, error } = await supabase
      .from('staple_ingredients')
      .select('*')
      .eq('group_id', selectedGroupId)
      .order('name')

    if (error) {
      console.error('Error fetching staples:', error)
      toast.error('Failed to load staples')
      setLoading(false)
      return
    }

    setStaples(data || [])
    setLoading(false)
  }

  const handleDeleteStaple = async () => {
    if (!stapleToDelete) return

    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('staple_ingredients')
        .delete()
        .eq('id', stapleToDelete.id)

      if (error) throw error

      toast.success('Staple ingredient deleted')
      fetchStaples()
    } catch (error) {
      console.error('Error deleting staple ingredient:', error)
      toast.error('Failed to delete staple ingredient')
    } finally {
      setIsDeleting(false)
      setStapleToDelete(null)
    }
  }

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const searchableStaples = staples.filter((staple) =>
    staple.name.toLowerCase().includes(normalizedSearchTerm)
  )

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        searchableStaples
          .map((staple) => normalizeCategory(staple.category))
          .filter((category): category is string => Boolean(category))
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [searchableStaples])

  const hasUncategorizedStaples = searchableStaples.some((staple) => !normalizeCategory(staple.category))

  const categoryQuickFilters = [
    { value: 'all', label: 'All staples', count: searchableStaples.length },
    ...categoryOptions.map((category) => ({
      value: category,
      label: category,
      count: searchableStaples.filter((staple) => normalizeCategory(staple.category) === category).length,
    })),
    ...(hasUncategorizedStaples || selectedCategory === UNCATEGORIZED_FILTER_VALUE
      ? [{
        value: UNCATEGORIZED_FILTER_VALUE,
        label: 'Uncategorized',
        count: searchableStaples.filter((staple) => !normalizeCategory(staple.category)).length,
      }]
      : []),
  ]

  const filteredStaples = searchableStaples.filter((staple) => {
    if (selectedCategory === 'all') return true
    if (selectedCategory === UNCATEGORIZED_FILTER_VALUE) {
      return !normalizeCategory(staple.category)
    }
    return normalizeCategory(staple.category) === selectedCategory
  })

  const totalPages = Math.max(1, Math.ceil(filteredStaples.length / STAPLES_PER_PAGE))

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const startIndex = (currentPage - 1) * STAPLES_PER_PAGE
  const paginatedStaples = filteredStaples.slice(startIndex, startIndex + STAPLES_PER_PAGE)
  const showingStart = filteredStaples.length === 0 ? 0 : startIndex + 1
  const showingEnd = Math.min(filteredStaples.length, startIndex + STAPLES_PER_PAGE)

  const hasActiveFilters = normalizedSearchTerm.length > 0 || selectedCategory !== 'all'

  const emptyStateMessage = hasActiveFilters
    ? 'No staples match your current filters. Try widening your search or clearing a filter.'
    : 'No staple ingredients have been added yet.'

  const selectedCategoryLabel = selectedCategory === 'all'
    ? 'all categories'
    : selectedCategory === UNCATEGORIZED_FILTER_VALUE
      ? 'uncategorized'
      : selectedCategory

  const handleClearFilters = () => {
    setSearchTerm('')
    setSelectedCategory('all')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staple Ingredients"
        description="Manage the items you buy every trip."
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
            Add Staple
          </Button>
        }
        context={
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="box-border h-10 w-full appearance-none rounded-md border border-solid border-input bg-card px-3 text-sm shadow-sm [background-clip:padding-box] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:w-[260px]"
          >
            <option value="">Select a group</option>
            {userGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        }
      />

      <Card>
        <CardHeader className="space-y-4 pb-4">
          <h2 className="text-lg font-semibold">Your Staples</h2>

          <div className="space-y-2 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
            <Input
              placeholder="Search staples..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

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
                    <div className="h-4 w-40 animate-pulse rounded-full bg-surface-2" />
                    <div className="h-3 w-24 animate-pulse rounded-full bg-surface-2" />
                    <div className="h-9 w-28 animate-pulse rounded-md bg-surface-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !selectedGroupId ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center text-sm text-muted-foreground shadow-sm">
              Select a group to view staples.
            </div>
          ) : filteredStaples.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
              {hasActiveFilters ? (
                <Button onClick={handleClearFilters} variant="outline" className="mt-4">
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                  Add Staple
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{showingStart}-{showingEnd}</span> of{' '}
                  <span className="font-semibold text-foreground">{filteredStaples.length}</span>{' '}
                  staple{filteredStaples.length === 1 ? '' : 's'} in{' '}
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
                {paginatedStaples.map((staple) => {
                  const category = normalizeCategory(staple.category)
                  return (
                    <article
                      key={staple.id}
                      className="group flex h-full flex-col justify-between rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:bg-surface-2/60 hover:shadow-md focus-within:shadow-md"
                    >
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold leading-tight">{staple.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            Stock target
                          </p>
                        </div>

                        <div className="inline-flex w-fit rounded-lg border border-border/60 bg-surface-2/70 px-3 py-1.5">
                          <p className="text-sm font-semibold text-foreground">
                            {staple.quantity} {staple.unit}
                          </p>
                        </div>

                        <div>
                          {category ? (
                            <Chip className="text-xs">
                              {category}
                            </Chip>
                          ) : (
                            <Chip className="text-xs text-muted-foreground">
                              Uncategorized
                            </Chip>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-1 border-t border-border/60 pt-3">
                        <IconButton
                          aria-label={`Edit ${staple.name}`}
                          onClick={() => setStapleToEdit(staple)}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          aria-label={`Delete ${staple.name}`}
                          variant="destructive"
                          onClick={() => setStapleToDelete(staple)}
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

      <CreateStapleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        groupId={selectedGroupId}
        onStapleCreated={fetchStaples}
      />

      <EditStapleDialog
        open={!!stapleToEdit}
        onOpenChange={(open) => !open && setStapleToEdit(null)}
        staple={stapleToEdit}
        onStapleUpdated={fetchStaples}
      />

      <AlertDialog open={!!stapleToDelete} onOpenChange={(open) => !open && setStapleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the staple ingredient &quot;{stapleToDelete?.name}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStaple}
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

