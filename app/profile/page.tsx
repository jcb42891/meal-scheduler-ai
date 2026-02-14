'use client'

import { useAuth } from '@/lib/contexts/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { buildClientAppUrl } from '@/lib/client-app-url'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { CreditCard, Loader2, Sparkles, UserCircle2 } from 'lucide-react'
import { getMagicImportBillingCtas } from '@/app/meals/magic-import-billing-cta'

type Profile = {
  first_name: string | null
  last_name: string | null
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

type ProfileTab = 'billing' | 'account'

export default function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [profile, setProfile] = useState<Profile>({ first_name: '', last_name: '' })
  const [isEditing, setIsEditing] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null)
  const [isBillingStatusLoading, setIsBillingStatusLoading] = useState(false)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ProfileTab>('billing')

  const billingCtas = useMemo(() => getMagicImportBillingCtas(billingStatus), [billingStatus])
  const creditsUsedPercent = billingStatus?.monthlyCredits
    ? Math.min(100, Math.max(0, (billingStatus.usedCredits / billingStatus.monthlyCredits) * 100))
    : 0
  const planLabel = billingStatus?.hasActiveSubscription ? 'Pro' : 'Free'

  useEffect(() => {
    const queryTab = searchParams.get('tab')
    if (queryTab === 'billing' || queryTab === 'account') {
      setActiveTab(queryTab)
      return
    }

    if (typeof window === 'undefined') return
    const hashTab = window.location.hash.replace('#', '')
    if (hashTab === 'billing' || hashTab === 'account') {
      setActiveTab(hashTab)
    }
  }, [searchParams])

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

    fetchProfile()
  }, [user, router])

  useEffect(() => {
    if (!user) {
      setBillingStatus(null)
      return
    }

    let isCancelled = false

    const fetchBillingStatus = async () => {
      setIsBillingStatusLoading(true)
      try {
        const query = new URLSearchParams({
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
  }, [user])

  const startBillingRedirect = async (path: '/api/billing/checkout' | '/api/billing/portal') => {
    const setLoading = path === '/api/billing/checkout' ? setIsCheckoutLoading : setIsPortalLoading
    setLoading(true)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
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

  const handleUpdateProfile = async () => {
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
        description="Manage billing, credits, and your account details."
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ProfileTab)} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-full border border-border/70 bg-card/80 p-1">
          <TabsTrigger
            value="billing"
            className="h-9 rounded-full px-4 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white"
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Billing & Credits
          </TabsTrigger>
          <TabsTrigger value="account" className="h-9 rounded-full px-4">
            <UserCircle2 className="h-4 w-4" aria-hidden="true" />
            Account Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="billing" id="billing" className="space-y-4">
          <Card className="overflow-hidden border-amber-200/70 bg-gradient-to-br from-amber-100/85 via-orange-100/85 to-rose-100/85">
            <CardContent className="p-5 sm:p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-end">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Billing Command Center
                  </span>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-amber-950 sm:text-2xl">Keep recipe magic flowing</h2>
                    <p className="text-sm text-amber-900/80">
                      Track account credits, manage your plan, and upgrade in one place.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-amber-900/85">
                    <span className="rounded-full border border-amber-300/70 bg-white/75 px-2.5 py-1">
                      Account Plan: {planLabel}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-300/70 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/80">Credits Remaining</p>
                  <p className="mt-1 text-3xl font-semibold leading-none text-amber-950">
                    {isBillingStatusLoading ? '--' : billingStatus ? billingStatus.remainingCredits : '--'}
                  </p>
                  <p className="mt-1 text-xs text-amber-900/80">
                    {billingStatus ? `of ${billingStatus.monthlyCredits} monthly credits` : 'Loading account usage'}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-900/20">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                      style={{ width: `${billingStatus ? 100 - creditsUsedPercent : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">Billing Actions</p>
                  <div className="flex min-h-10 flex-wrap items-center gap-2">
                    {isBillingStatusLoading ? (
                      <Button type="button" variant="outline" disabled>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Loading billing status...
                      </Button>
                    ) : billingStatus && billingStatus.billing.stripeConfigured && billingStatus.billing.canManage ? (
                      <>
                        {billingCtas.showUpgrade && (
                          <Button
                            type="button"
                            onClick={() => startBillingRedirect('/api/billing/checkout')}
                            disabled={isCheckoutLoading}
                            className="h-10 bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:brightness-105"
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
                            {isPortalLoading ? 'Opening portal...' : 'Manage Billing'}
                          </Button>
                        )}
                      </>
                    ) : null}
                  </div>

                  {billingStatus && !billingStatus.billing.stripeConfigured ? (
                    <p className="text-xs text-amber-900/80">Stripe billing is not configured yet.</p>
                  ) : billingStatus && !billingStatus.billing.canManage ? (
                    <p className="text-xs text-amber-900/80">Billing is unavailable for this account.</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <h3 className="text-lg font-semibold">Current Billing Snapshot</h3>
              <p className="text-sm text-muted-foreground">Usage and plan details for your account.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {isBillingStatusLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading billing status...
                </p>
              ) : billingStatus ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-card p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan</p>
                      <p className="mt-1 text-lg font-semibold capitalize">{billingStatus.planTier}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Used</p>
                      <p className="mt-1 text-lg font-semibold">{billingStatus.usedCredits}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Remaining</p>
                      <p className="mt-1 text-lg font-semibold">{billingStatus.remainingCredits}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-surface-2/40 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Credit usage this month</span>
                      <span>{Math.round(creditsUsedPercent)}% used</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border/60">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-primary to-emerald-600"
                        style={{ width: `${creditsUsedPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {billingStatus.graceActive ? 'Grace window active.' : 'Billing cycle active.'}
                    </p>
                  </div>

                  {billingCtas.showBlockedNotice && (
                    <p className="rounded-md border border-amber-300/70 bg-amber-100/60 px-3 py-2 text-sm text-amber-900">
                      Magic Import is currently blocked for your account. Upgrading to Pro restores access.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to load billing status right now.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card>
            <CardHeader className="flex flex-col items-start justify-between space-y-3 sm:flex-row sm:items-center sm:space-y-0">
              <h2 className="text-lg font-semibold sm:text-xl">Account Details</h2>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
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
                      onChange={(event) => setFirstName(event.target.value)}
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
                      onChange={(event) => setLastName(event.target.value)}
                      className="mt-1 w-full"
                    />
                  ) : (
                    <p className="text-foreground">{profile.last_name || '-'}</p>
                  )}
                </div>

                {isEditing && (
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
