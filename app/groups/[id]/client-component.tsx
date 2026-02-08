'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'

type Invitation = {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

type Group = {
  id: string
  name: string
  owner_id: string
}

type Profile = {
  email: string
}

type MemberWithProfile = {
  user_id: string
  role: string
  profile: Profile
}

export function GroupManageClient({ groupId }: { groupId: string }) {
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchGroup()
    fetchInvitations()
    fetchMembers()
  }, [groupId])

  useEffect(() => {
    if (group && user) {
      setIsOwner(group.owner_id === user.id)
    }
  }, [group, user])

  const fetchGroup = async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, owner_id')
      .eq('id', groupId)
      .single()

    if (error) {
      toast.error('Failed to load group')
    } else {
      setGroup(data)
    }
  }

  const fetchInvitations = async () => {
    const { data, error } = await supabase
      .from('group_invitations')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load invitations')
    } else {
      setInvitations(data)
    }
  }

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from('group_members')
      .select(`
        user_id,
        role,
        profile:profiles!user_id(email)
      `)
      .eq('group_id', groupId)
      .returns<MemberWithProfile[]>()

    if (error) {
      toast.error('Failed to load members')
      console.error('Error loading members:', error)
      return
    }

    const transformedData = data.map(member => ({
      user_id: member.user_id,
      role: member.role,
      profile: {
        email: member.profile.email || 'No email'
      }
    }))

    setMembers(transformedData)
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', user?.id)
        .single()

      if (existingMember) {
        toast.error('User is already a member of this group')
        return
      }

      // Check if invitation already exists
      const { data: existingInvite } = await supabase
        .from('group_invitations')
        .select('id, status')
        .eq('group_id', groupId)
        .eq('email', inviteEmail)
        .single()

      if (existingInvite && existingInvite.status === 'pending') {
        toast.error('An invitation is already pending for this email')
        return
      }

      // Create new invitation
      const { error: inviteError } = await supabase
        .from('group_invitations')
        .insert({
          group_id: groupId,
          email: inviteEmail,
          invited_by: user?.id,
          status: 'pending'
        })

      if (inviteError) throw inviteError

      toast.success('Invitation created successfully')
      setInviteEmail('')
      fetchInvitations()
    } catch (error) {
      console.error('Error creating invitation:', error)
      toast.error('Failed to create invitation')
    } finally {
      setIsLoading(false)
    }
  }

  const copyInviteLink = async (inviteId: string) => {
    // Create a short URL using a service like TinyURL
    const longUrl = `${window.location.origin}/groups/accept-invite?token=${groupId}&invite=${inviteId}`
    
    try {
      const response = await fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl))
      const shortUrl = await response.text()
      
      await navigator.clipboard.writeText(shortUrl)
      toast.success('Invite link copied to clipboard')
    } catch (error) {
      console.error('Error creating short URL:', error)
      // Fallback to copying long URL
      await navigator.clipboard.writeText(longUrl)
      toast.success('Invite link copied to clipboard')
    }
  }

  const handleLeaveGroup = async () => {
    if (!user || isOwner) return
    
    setIsLeaving(true)
    try {
      // Check if user is the last member
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)

      if (count === 1) {
        toast.error('You cannot leave the group as you are the last member')
        return
      }

      // Remove user from group
      const { error } = await supabase
        .from('group_members')
        .delete()
        .match({
          group_id: groupId,
          user_id: user.id
        })

      if (error) {
        console.error('Delete error:', error)
        throw error
      }

      toast.success('Successfully left the group')
      router.push('/groups')
    } catch (error) {
      console.error('Error leaving group:', error)
      toast.error('Failed to leave group')
    } finally {
      setIsLeaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={group?.name || 'Loading...'}
        description="Manage invitations, members, and group sharing access."
        actions={
          !isOwner ? (
          <Button 
            variant="destructive" 
            onClick={handleLeaveGroup}
            disabled={isLeaving}
            className="w-full sm:w-auto"
          >
            {isLeaving ? 'Leaving...' : 'Leave Group'}
          </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <h2 className="text-lg sm:text-xl font-semibold">Invite Members</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              placeholder="Enter email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="w-full"
            />
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? 'Sending...' : 'Send Invite'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg sm:text-xl font-semibold">Members</h2>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.user_id} className="border-b">
                    <td className="p-4 break-all">
                      {member.profile.email}
                      {member.user_id === user?.id && (
                        <span className="ml-2 text-sm text-muted-foreground">(me)</span>
                      )}
                    </td>
                    <td className="p-4 capitalize">{member.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg sm:text-xl font-semibold">Past Invitations</h2>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-muted-foreground">No past invitations</p>
          ) : (
            <div className="space-y-4">
              {invitations.map((invite) => (
                <div key={invite.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <p className="break-all">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteLink(invite.id)}
                      className="w-full sm:w-auto"
                    >
                      Copy Invite Link
                    </Button>
                    <span className="capitalize text-center sm:text-left">{invite.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 
