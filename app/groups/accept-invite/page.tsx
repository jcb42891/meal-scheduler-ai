'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(true)

  useEffect(() => {
    const processInvite = async () => {
      const token = searchParams.get('token')
      const inviteId = searchParams.get('invite')
      
      console.log('Processing invite:', { token, inviteId }) // Debug log

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

        console.log('Current user:', user) // Debug log

        // Verify invitation exists and is pending
        const { data: invite, error: inviteError } = await supabase
          .from('group_invitations')
          .select('email, status')
          .eq('id', inviteId)
          .eq('group_id', token)
          .single()

        console.log('Invitation data:', { invite, inviteError }) // Debug log

        if (inviteError || !invite || invite.status !== 'pending' || invite.email !== user.email) {
          console.log('Invitation validation failed:', { 
            hasError: !!inviteError, 
            exists: !!invite, 
            status: invite?.status, 
            emailMatch: invite?.email === user.email 
          })
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
          console.error('Error creating member:', memberError)
          throw memberError
        }

        // Update invitation status
        await supabase
          .from('group_invitations')
          .update({ status: 'accepted' })
          .eq('id', inviteId)

        toast.success('Successfully joined group')
        router.push('/groups')
      } catch (error) {
        console.error('Error accepting invitation:', error)
        toast.error('Failed to process invitation')
        router.push('/')
      } finally {
        setIsProcessing(false)
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