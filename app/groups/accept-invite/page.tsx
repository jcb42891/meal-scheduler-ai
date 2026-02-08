'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const DEFAULT_POST_ACCEPT_PATH = '/groups'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const processInvite = async () => {
      const token = searchParams.get('token')

      if (!token) {
        toast.error('Invalid invitation link')
        router.push('/')
        return
      }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          const nextPath = `/groups/accept-invite?token=${encodeURIComponent(token)}`
          router.replace(`/auth?next=${encodeURIComponent(nextPath)}`)
          return
        }

        const response = await fetch('/api/groups/invitations/accept', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          toast.error(payload?.error || 'Failed to process invitation')
          router.replace('/groups')
          return
        }

        toast.success('Successfully joined group')
        router.replace(payload?.groupId ? `/groups/${payload.groupId}` : DEFAULT_POST_ACCEPT_PATH)
      } catch {
        toast.error('Failed to process invitation')
        router.replace('/groups')
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
