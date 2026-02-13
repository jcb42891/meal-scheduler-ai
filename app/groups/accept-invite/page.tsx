'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { toast } from 'sonner'

const DEFAULT_POST_ACCEPT_PATH = '/groups'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isResolvingInvite, setIsResolvingInvite] = useState(true)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [inviteeEmail, setInviteeEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const token = searchParams.get('token')
  const nextPath = useMemo(
    () => (token ? `/groups/accept-invite?token=${encodeURIComponent(token)}` : '/groups/accept-invite'),
    [token],
  )

  const redirectToSignIn = useCallback(() => {
    const params = new URLSearchParams({
      next: nextPath,
    })

    if (inviteeEmail) {
      params.set('email', inviteeEmail)
      params.set('mode', 'signin')
    }

    router.replace(`/auth?${params.toString()}`)
  }, [inviteeEmail, nextPath, router])

  const acceptInvite = useCallback(
    async (inviteToken: string) => {
      const response = await fetch('/api/groups/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: inviteToken }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(payload?.error || 'Failed to process invitation')
        router.replace('/groups')
        return false
      }

      toast.success('Successfully joined group')
      router.replace(payload?.groupId ? `/groups/${payload.groupId}` : DEFAULT_POST_ACCEPT_PATH)
      return true
    },
    [router],
  )

  useEffect(() => {
    let isActive = true

    const processInvite = async () => {
      if (!token) {
        toast.error('Invalid invitation link')
        router.replace('/')
        return
      }

      setIsResolvingInvite(true)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!isActive) {
          return
        }

        if (user) {
          await acceptInvite(token)
          return
        }

        const response = await fetch('/api/groups/invitations/resolve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        })

        const payload = await response.json().catch(() => ({}))
        if (!isActive) {
          return
        }

        if (!response.ok) {
          const fallbackMessage = 'Failed to process invitation'
          if (response.status === 409) {
            toast.error(payload?.error || fallbackMessage)
            router.replace(`/auth?next=${encodeURIComponent(nextPath)}`)
            return
          }

          toast.error(payload?.error || fallbackMessage)
          router.replace('/')
          return
        }

        setInviteeEmail(payload?.inviteeEmail ?? '')
      } catch {
        if (!isActive) {
          return
        }

        toast.error('Failed to process invitation')
        router.replace('/')
      } finally {
        if (isActive) {
          setIsResolvingInvite(false)
        }
      }
    }

    void processInvite()

    return () => {
      isActive = false
    }
  }, [acceptInvite, nextPath, router, token])

  const handleCreateAccount = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!token || !inviteeEmail) {
        toast.error('Invalid invitation link')
        return
      }

      if (password.length < 8) {
        toast.error('Password must be at least 8 characters long')
        return
      }

      if (password !== confirmPassword) {
        toast.error('Passwords do not match')
        return
      }

      setIsCreatingAccount(true)

      try {
        const claimResponse = await fetch('/api/groups/invitations/claim-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            password,
          }),
        })
        const claimPayload = await claimResponse.json().catch(() => ({}))
        if (!claimResponse.ok) {
          if (claimResponse.status === 409) {
            toast.error(claimPayload?.error || 'An account already exists for this email. Please sign in.')
            redirectToSignIn()
            return
          }

          toast.error(claimPayload?.error || 'Failed to create account')
          return
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: inviteeEmail,
          password,
        })
        if (signInError) {
          toast.error(signInError.message || 'Account created, but automatic sign-in failed.')
          redirectToSignIn()
          return
        }

        await acceptInvite(token)
      } catch {
        toast.error('Failed to create account')
      } finally {
        setIsCreatingAccount(false)
      }
    },
    [acceptInvite, confirmPassword, inviteeEmail, password, redirectToSignIn, token],
  )

  if (isResolvingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Processing invitation...</h1>
        </div>
      </div>
    )
  }

  if (!inviteeEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Unable to load invitation</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <h1 className="text-xl font-semibold">Set Your Password</h1>
          <p className="text-sm text-muted-foreground">
            Create an account for <span className="font-medium text-foreground">{inviteeEmail}</span> to join the
            group.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <Input type="email" value={inviteeEmail} readOnly aria-readonly="true" />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
            />
            <Button type="submit" className="w-full" disabled={isCreatingAccount}>
              {isCreatingAccount ? 'Creating account...' : 'Create account and join group'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={redirectToSignIn}>
              Already have an account? Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-semibold">Loading...</h1>
          </div>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  )
}
