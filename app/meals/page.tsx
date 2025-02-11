'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { CreateMealDialog } from './create-meal-dialog'

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
                    <span className="text-sm text-muted-foreground">
                      Category: {meal.category}
                    </span>
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
    </div>
  )
} 