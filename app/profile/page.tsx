'use client'

import { useAuth } from '@/lib/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { buildClientAppUrl } from '@/lib/client-app-url'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Loader2 } from 'lucide-react'
import { getMagicImportBillingCtas } from '@/app/meals/magic-import-billing-cta'
import { readStoredBillingGroupId, writeStoredBillingGroupId } from '@/lib/billing/client'

type Profile = {
  first_name: string | null
  last_name: string | null
}

type Group = {
  id: string
  name: string
}

type MemberGroupRow = {
  group: Group
}

type BillingStatusResponse = {
  planTier: string
  allowed: boolean
  reasonCode: string | null
  periodStart: string
  monthlyCredits: number
  usedCredits: number
  remainingCredits: number
  requiredCredits: number
  isUnlimited: boolean
  hasActiveSubscription: boolean
  graceActive: boolean
  isEnvOverride: boolean
  billing: {
    stripeConfigured: boolean
    canManage: boolean
  }
}

export default function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>({ first_name: '', last_name: '' })
  const [isEditing, setIsEditing] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [userGroups, setUserGroups] = useState<Group[]>([])
  const [selectedBillingGroupId, setSelectedBillingGroupId] = useState('')
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null)
  const [isBillingStatusLoading, setIsBillingStatusLoading] = useState(false)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [isPortalLoading, setIsPortalLoading] = useState(false)

  const billingCtas = useMemo(() => getMagicImportBillingCtas(billingStatus), [billingStatus])

  useEffect(() => {
    if (!user) {
      router.push('/auth')
      return
    }

    // Fetch profile data
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

      if (data) {
        setProfile(data)
        setFirstName(data.first_name || '')
        setLastName(data.last_name || '')
      }
    }

    const fetchGroups = async () => {
      const [{ data: ownedGroups, error: ownedError }, { data: memberGroups, error: memberError }] = await Promise.all([
        supabase.from('groups').select('id, name').eq('owner_id', user.id),
        supabase
          .from('group_members')
          .select('group:groups(id, name)')
          .eq('user_id', user.id)
          .returns<MemberGroupRow[]>(),
      ])

      if (ownedError || memberError) {
        toast.error('Failed to load groups')
        return
      }

      const allGroups = [
        ...(ownedGroups ?? []),
        ...((memberGroups ?? [])
          .map((row) => row.group)
          .filter((group): group is Group => Boolean(group))),
      ].filter((group, index, source) => index === source.findIndex((item) => item.id === group.id))

      setUserGroups(allGroups)

      if (allGroups.length === 0) {
        setSelectedBillingGroupId('')
        return
      }

      const storedGroupId = readStoredBillingGroupId()
      const hasStoredGroup = Boolean(storedGroupId && allGroups.some((group) => group.id === storedGroupId))
      const nextGroupId = hasStoredGroup && storedGroupId ? storedGroupId : allGroups[0].id
      setSelectedBillingGroupId(nextGroupId)
      if (nextGroupId && !hasStoredGroup) {
        writeStoredBillingGroupId(nextGroupId)
      }
    }

    fetchProfile()
    fetchGroups()
  }, [user, router])

  useEffect(() => {
    if (!selectedBillingGroupId) {
      setBillingStatus(null)
      return
    }

    let isCancelled = false

    const fetchBillingStatus = async () => {
      setIsBillingStatusLoading(true)
      try {
        const query = new URLSearchParams({
          groupId: selectedBillingGroupId,
          sourceType: 'url',
        })
        const response = await fetch(`/api/billing/status?${query.toString()}`)
        if (!response.ok) {
          throw new Error('Unable to load billing status.')
        }

        const payload = (await response.json()) as BillingStatusResponse
        if (isCancelled) return
        setBillingStatus(payload)
      } catch {
        if (isCancelled) return
        setBillingStatus(null)
      } finally {
        if (isCancelled) return
        setIsBillingStatusLoading(false)
      }
    }

    void fetchBillingStatus()

    return () => {
      isCancelled = true
    }
  }, [selectedBillingGroupId])

  const handleBillingGroupChange = (groupId: string) => {
    setSelectedBillingGroupId(groupId)
    writeStoredBillingGroupId(groupId)
  }

  const startBillingRedirect = async (path: '/api/billing/checkout' | '/api/billing/portal') => {
    if (!selectedBillingGroupId) return

    const setLoading = path === '/api/billing/checkout' ? setIsCheckoutLoading : setIsPortalLoading
    setLoading(true)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupId: selectedBillingGroupId }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          payload && typeof payload.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : 'Unable to open billing.'
        throw new Error(message)
      }

      const url = payload && typeof payload.url === 'string' ? payload.url : ''
      if (!url) {
        throw new Error('Billing redirect URL is missing.')
      }

      window.location.assign(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open billing.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!user?.email) return

    setIsResetting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: buildClientAppUrl('/update-password'),
      })

      if (error) {
        toast.error('Failed to send reset email')
        console.error('Reset password error:', error)
      } else {
        toast.success('Password reset email sent')
      }
    } catch (err) {
      console.error('Error:', err)
      toast.error('An error occurred')
    } finally {
      setIsResetting(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdating(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          updated_at: new Date().toISOString()
        })
        .eq('id', user?.id)

      if (error) {
        console.error('Update error:', error)
        throw error
      }

      // Update local profile state
      setProfile({
        ...profile,
        first_name: firstName,
        last_name: lastName
      })
      
      toast.success('Profile updated successfully')
      setIsEditing(false) // Exit edit mode
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Profile"
        description="Manage your account details and password settings."
      />
      
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0">
          <h2 className="text-lg sm:text-xl font-semibold">Account Details</h2>
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
            {!isEditing && (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="w-full sm:w-auto"
                >
                  {isResetting ? 'Sending...' : 'Reset Password'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(true)}
                  className="w-full sm:w-auto"
                >
                  Edit Profile
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <p className="break-all text-foreground">{user?.email}</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">First Name</label>
              {isEditing ? (
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full"
                />
              ) : (
                <p className="text-foreground">{profile.first_name || '-'}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Last Name</label>
              {isEditing ? (
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full"
                />
              ) : (
                <p className="text-foreground">{profile.last_name || '-'}</p>
              )}
            </div>

            {isEditing && (
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateProfile} 
                  disabled={isUpdating}
                  className="w-full sm:w-auto"
                >
                  {isUpdating ? 'Updating...' : 'Update Profile'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card id="billing">
        <CardHeader className="space-y-3">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Billing & Magic Import Credits</h2>
            <p className="text-sm text-muted-foreground">Upgrade to Pro or manage credits for any group you belong to.</p>
          </div>
          <select
            value={selectedBillingGroupId}
            onChange={(event) => handleBillingGroupChange(event.target.value)}
            className="box-border h-10 w-full appearance-none rounded-md border border-solid border-input bg-card px-3 text-sm shadow-sm [background-clip:padding-box] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:max-w-xs"
          >
            <option value="">Select a group</option>
            {userGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedBillingGroupId ? (
            <p className="text-sm text-muted-foreground">Select a group to view billing details.</p>
          ) : isBillingStatusLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading billing status...
            </p>
          ) : billingStatus ? (
            <>
              <div className="rounded-[10px] border border-border/60 bg-surface-2/40 p-3 text-sm">
                <p className="font-medium">
                  {billingStatus.remainingCredits} of {billingStatus.monthlyCredits} credits left this month
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Plan: {billingStatus.planTier}
                  {billingStatus.graceActive ? ' (grace window active)' : ''}
                </p>
              </div>

              {!billingStatus.billing.stripeConfigured ? (
                <p className="text-sm text-muted-foreground">Stripe billing is not configured yet.</p>
              ) : !billingStatus.billing.canManage ? (
                <p className="text-sm text-muted-foreground">
                  You need group membership access to manage billing for this group.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {billingCtas.showUpgrade && (
                    <Button
                      type="button"
                      onClick={() => startBillingRedirect('/api/billing/checkout')}
                      disabled={isCheckoutLoading}
                    >
                      {isCheckoutLoading ? 'Opening Stripe...' : 'Upgrade to Pro'}
                    </Button>
                  )}
                  {billingCtas.showManage && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => startBillingRedirect('/api/billing/portal')}
                      disabled={isPortalLoading}
                    >
                      {isPortalLoading ? 'Opening portal...' : 'Manage / Add Credits'}
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load billing status right now.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 
