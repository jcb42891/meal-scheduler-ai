'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

type Invitation = {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export function GroupManageClient({ groupId }: { groupId: string }) {
  const { user } = useAuth()
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchInvitations()
  }, [groupId])

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error: inviteError } = await supabase
        .from('group_invitations')
        .insert({
          group_id: groupId,
          email: inviteEmail,
          invited_by: user?.id,
          status: 'pending'
        })

      if (inviteError) throw inviteError

      const { error: emailError } = await supabase.functions.invoke('send-group-invite', {
        body: { 
          groupId: groupId,
          email: inviteEmail,
        }
      })

      if (emailError) throw emailError

      toast.success('Invitation sent successfully')
      setInviteEmail('')
      fetchInvitations()
    } catch (error) {
      console.error('Error sending invitation:', error)
      toast.error('Failed to send invitation')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Invite Members</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Invite'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Pending Invitations</h2>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-muted-foreground">No pending invitations</p>
          ) : (
            <div className="space-y-4">
              {invitations.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between">
                  <div>
                    <p>{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="capitalize">{invite.status}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 