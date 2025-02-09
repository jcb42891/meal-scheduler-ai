'use client'

import { useAuth } from '@/lib/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

type Group = {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export default function GroupsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/auth')
      return
    }

    fetchGroups()
  }, [user, router])

  const fetchGroups = async () => {
    try {
      // First get user's group memberships
      const { data: memberships, error: membershipError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user?.id)

      if (membershipError) throw membershipError

      if (!memberships?.length) {
        setGroups([])
        return
      }

      // Then fetch the actual groups
      const groupIds = memberships.map(m => m.group_id)
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds)

      if (groupsError) throw groupsError

      setGroups(groupsData || [])
    } catch (error) {
      console.error('Error fetching groups:', error)
      toast.error('Failed to load groups')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsCreating(true)
    try {
      // Start a Supabase transaction
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert([
          { 
            name: newGroupName, 
            owner_id: user.id 
          }
        ])
        .select()
        .single()

      if (groupError) {
        console.error('Error creating group:', groupError)
        throw groupError
      }

      console.log('Group created:', groupData)

      // Now create the group membership
      const { error: memberError } = await supabase
        .from('group_members')
        .insert([
          { 
            group_id: groupData.id, 
            user_id: user.id,
            role: 'owner'
          }
        ])

      if (memberError) {
        console.error('Error creating group membership:', memberError)
        // Attempt to rollback group creation
        await supabase.from('groups').delete().eq('id', groupData.id)
        throw memberError
      }

      toast.success('Group created successfully')
      setShowCreateDialog(false)
      setNewGroupName('')
      fetchGroups() // Refresh the list
    } catch (error) {
      console.error('Error in group creation:', error)
      toast.error('Failed to create group')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Group
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground">Loading groups...</div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>You haven't joined any groups yet.</p>
            <p>Create a group to get started!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <h2 className="text-xl font-semibold">{group.name}</h2>
              </CardHeader>
              <CardContent>
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => router.push(`/calendar?group=${group.id}`)}
                  >
                    View Calendar
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => router.push(`/groups/${group.id}`)}
                  >
                    Manage
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">
                Group Name
              </label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter group name"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Group'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
} 