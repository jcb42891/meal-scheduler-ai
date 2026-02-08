'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const processInvite = async () => {
      const token = searchParams.get('token')
      const inviteId = searchParams.get('invite')

      if (!token || !inviteId) {
        toast.error('Invalid invitation link')
        router.push('/')
        return
      }

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/auth')
          return
        }

        // Verify invitation exists and is pending
        const { data: invite, error: inviteError } = await supabase
          .from('group_invitations')
          .select('email, status, expires_at')
          .eq('id', inviteId)
          .eq('group_id', token)
          .single()

        const normalizedInviteEmail = invite?.email?.trim().toLowerCase()
        const normalizedUserEmail = user.email?.trim().toLowerCase()
        const isExpired = invite?.expires_at ? new Date(invite.expires_at) <= new Date() : false

        if (
          inviteError
          || !invite
          || invite.status !== 'pending'
          || !normalizedInviteEmail
          || !normalizedUserEmail
          || normalizedInviteEmail !== normalizedUserEmail
          || isExpired
        ) {
          toast.error('Invalid or expired invitation')
          router.push('/')
          return
        }

        // Accept invitation
        const { error: memberError } = await supabase
          .from('group_members')
          .insert({
            group_id: token,
            user_id: user.id,
            role: 'member'
          })

        if (memberError) {
          console.error('Failed to create group membership during invite acceptance')
          throw memberError
        }

        // Update invitation status
        await supabase
          .from('group_invitations')
          .update({ status: 'accepted' })
          .eq('id', inviteId)

        toast.success('Successfully joined group')
        router.push('/groups')
      } catch {
        console.error('Failed to process invitation')
        toast.error('Failed to process invitation')
        router.push('/')
      }
    }

    processInvite()
  }, [searchParams, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Processing invitation...</h1>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Loading...</h1>
        </div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  )
} 
