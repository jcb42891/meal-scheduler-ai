'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Chip } from '@/components/ui/chip'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
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
import { Trash2, Pencil } from 'lucide-react'
import { EditStapleDialog } from './edit-staple-dialog'
import { PageHeader } from '@/components/page-header'

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

  useEffect(() => {
    if (!user) {
      router.push('/auth')
      return
    }
    fetchUserGroups()
  }, [user, router])

  useEffect(() => {
    if (!selectedGroupId) return
    fetchStaples()
  }, [selectedGroupId])

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
      ...memberGroups.map(m => ({
        id: m.group.id,
        name: m.group.name,
      })),
    ].filter((group, index, self) =>
      index === self.findIndex((g) => g.id === group.id)
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

  const categoryOptions = useMemo(() => {
    const categories = staples
      .map((staple) => staple.category)
      .filter((category): category is string => Boolean(category))
      .map((category) => category.trim())
      .filter((category) => category.length > 0)
    return ['all', ...Array.from(new Set(categories)).sort()]
  }, [staples])

  const filteredStaples = staples.filter((staple) => {
    const matchesSearch = staple.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || staple.category === selectedCategory
    return matchesSearch && matchesCategory
  })

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
            className="h-10 w-full sm:w-[260px] rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
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
        <CardHeader className="space-y-3 pb-4">
          <h2 className="text-lg font-semibold">Your Staples</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Search staples"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sm:max-w-xs"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-10 w-full sm:w-[220px] rounded-[10px] border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All categories' : option}
                </option>
              ))}
            </select>
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
                      <div className="h-3 w-24 rounded-full bg-surface-2 animate-pulse" />
                    </div>
                    <div className="h-6 w-16 rounded-full bg-surface-2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredStaples.length === 0 && selectedGroupId ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                {searchTerm || selectedCategory !== 'all'
                  ? 'No staples match your filters.'
                  : 'No staple ingredients have been added yet.'}
              </p>
              {!searchTerm && selectedCategory === 'all' && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="mt-4"
                >
                  Add Staple
                </Button>
              )}
            </div>
          ) : !selectedGroupId ? (
            <div className="rounded-xl border border-border/60 bg-surface-2/70 p-6 text-center text-sm text-muted-foreground shadow-sm">
              Select a group to view staples.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredStaples.map((staple) => (
                <div
                  key={staple.id}
                  className="group rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-colors hover:bg-surface-2/60 hover:shadow-md focus-within:shadow-md"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-medium">{staple.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {staple.quantity} {staple.unit}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                      {staple.category && (
                        <Chip className="text-xs">
                          {staple.category}
                        </Chip>
                      )}
                      <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
                    </div>
                  </div>
                </div>
              ))}
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
