'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { supabase } from '@/lib/supabase'
import {
  BILLING_GROUP_CHANGE_EVENT,
  BILLING_GROUPS_UPDATED_EVENT,
  BILLING_STATUS_UPDATED_EVENT,
  readStoredBillingGroupId,
} from '@/lib/billing/client'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Crown, LogOut, Menu, Sparkles, Wallet } from 'lucide-react'

type Group = {
  id: string
  name: string
}

type MemberGroupRow = {
  group: Group
}

type BillingStatusResponse = {
  planTier: string
  hasActiveSubscription: boolean
  monthlyCredits: number
  remainingCredits: number
}

export function Navbar() {
  const { user, signOut, loading } = useAuth()
  const pathname = usePathname()
  const [billingGroups, setBillingGroups] = useState<Group[]>([])
  const [activeBillingGroupId, setActiveBillingGroupId] = useState('')
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null)
  const [isBillingStatusLoading, setIsBillingStatusLoading] = useState(false)
  const [groupsRefreshVersion, setGroupsRefreshVersion] = useState(0)
  const [billingStatusRefreshVersion, setBillingStatusRefreshVersion] = useState(0)
  const hasBillingGroups = billingGroups.length > 0
  const hasProTier =
    hasBillingGroups && (billingStatus?.planTier === 'pro' || billingStatus?.hasActiveSubscription === true)
  const billingCtaHref = hasBillingGroups ? '/profile?tab=billing' : '/groups'
  const billingCtaLabel = hasBillingGroups ? 'Upgrade to Pro' : 'Create Group to Upgrade'
  const billingMenuLabel = hasProTier ? 'Manage Billing' : billingCtaLabel
  const creditLabel = isBillingStatusLoading
    ? 'Loading credits...'
    : billingStatus
      ? `${billingStatus.remainingCredits}/${billingStatus.monthlyCredits} credits`
      : 'Credits unavailable'
  const creditUsagePercent = billingStatus?.monthlyCredits
    ? Math.min(100, Math.max(0, (billingStatus.remainingCredits / billingStatus.monthlyCredits) * 100))
    : 0

  const navItems = [
    { href: '/calendar', label: 'Calendar' },
    { href: '/meals', label: 'Meal Library' },
    { href: '/staples', label: 'Staple Ingredients' },
    { href: '/groups', label: 'Groups' },
    { href: '/profile', label: 'Profile' },
  ]

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  useEffect(() => {
    let isCancelled = false

    const loadUserGroups = async () => {
      if (!user) {
        setBillingGroups([])
        setActiveBillingGroupId('')
        setBillingStatus(null)
        setIsBillingStatusLoading(false)
        return
      }

      const [{ data: ownedGroups, error: ownedError }, { data: memberGroups, error: memberError }] = await Promise.all([
        supabase.from('groups').select('id, name').eq('owner_id', user.id),
        supabase
          .from('group_members')
          .select('group:groups(id, name)')
          .eq('user_id', user.id)
          .returns<MemberGroupRow[]>(),
      ])

      if (isCancelled) return
      if (ownedError || memberError) {
        setBillingGroups([])
        setActiveBillingGroupId('')
        setBillingStatus(null)
        return
      }

      const uniqueGroups = [
        ...(ownedGroups ?? []),
        ...((memberGroups ?? [])
          .map((row) => row.group)
          .filter((group): group is Group => Boolean(group))),
      ].filter((group, index, source) => index === source.findIndex((item) => item.id === group.id))

      setBillingGroups(uniqueGroups)

      if (uniqueGroups.length === 0) {
        setActiveBillingGroupId('')
        setBillingStatus(null)
        return
      }

      const storedGroupId = readStoredBillingGroupId()
      const hasStoredGroup = Boolean(storedGroupId && uniqueGroups.some((group) => group.id === storedGroupId))
      const nextGroupId = hasStoredGroup && storedGroupId ? storedGroupId : uniqueGroups[0].id
      setActiveBillingGroupId((current) => {
        if (current && uniqueGroups.some((group) => group.id === current)) {
          return current
        }
        return nextGroupId
      })
    }

    void loadUserGroups()

    return () => {
      isCancelled = true
    }
  }, [groupsRefreshVersion, pathname, user?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const requestGroupsRefresh = () => {
      setGroupsRefreshVersion((current) => current + 1)
    }

    const handleBillingGroupChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ groupId?: string }>
      const nextGroupId = customEvent.detail?.groupId
      if (!nextGroupId) return
      if (!billingGroups.some((group) => group.id === nextGroupId)) return
      setActiveBillingGroupId(nextGroupId)
    }

    const requestBillingStatusRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ groupId?: string }>
      const nextGroupId = customEvent.detail?.groupId
      if (nextGroupId && nextGroupId !== activeBillingGroupId) return
      setBillingStatusRefreshVersion((current) => current + 1)
    }

    window.addEventListener(BILLING_GROUPS_UPDATED_EVENT, requestGroupsRefresh)
    window.addEventListener('focus', requestGroupsRefresh)
    window.addEventListener(BILLING_GROUP_CHANGE_EVENT, handleBillingGroupChange as EventListener)
    window.addEventListener(BILLING_STATUS_UPDATED_EVENT, requestBillingStatusRefresh as EventListener)
    return () => {
      window.removeEventListener(BILLING_GROUPS_UPDATED_EVENT, requestGroupsRefresh)
      window.removeEventListener('focus', requestGroupsRefresh)
      window.removeEventListener(BILLING_GROUP_CHANGE_EVENT, handleBillingGroupChange as EventListener)
      window.removeEventListener(BILLING_STATUS_UPDATED_EVENT, requestBillingStatusRefresh as EventListener)
    }
  }, [activeBillingGroupId, billingGroups])

  useEffect(() => {
    let isCancelled = false

    const loadBillingStatus = async () => {
      if (!user || !activeBillingGroupId) {
        setBillingStatus(null)
        setIsBillingStatusLoading(false)
        return
      }

      setIsBillingStatusLoading(true)
      try {
        const query = new URLSearchParams({
          groupId: activeBillingGroupId,
          sourceType: 'url',
        })
        const response = await fetch(`/api/billing/status?${query.toString()}`)

        if (!response.ok) {
          throw new Error('Failed to load billing status')
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

    void loadBillingStatus()

    return () => {
      isCancelled = true
    }
  }, [activeBillingGroupId, billingStatusRefreshVersion, user?.id])

  return (
    <nav className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            Pantry Planner
          </Link>

          {loading ? (
            <div className="hidden md:flex items-center gap-2">
              <div className="h-8 w-20 animate-pulse rounded-full bg-muted/80" aria-hidden="true" />
              <div className="h-8 w-24 animate-pulse rounded-full bg-muted/80" aria-hidden="true" />
              <div className="h-8 w-16 animate-pulse rounded-full bg-muted/80" aria-hidden="true" />
            </div>
          ) : user ? (
            <div className="hidden md:flex items-center gap-1 rounded-full border border-border/70 bg-card/80 p-1 shadow-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="flex items-center gap-2" aria-hidden="true">
            <div className="h-9 w-9 animate-pulse rounded-md bg-muted/80 md:hidden" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted/80" />
          </div>
        ) : user ? (
          <div className="flex items-center gap-2">
            {hasBillingGroups && (
              <Link
                href={billingCtaHref}
                className="group inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-100 via-orange-100 to-rose-100 px-2.5 py-1 text-[11px] font-semibold text-amber-950 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:px-3 sm:text-xs"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-amber-700 shadow-sm">
                  <Wallet className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="leading-none">{creditLabel}</span>
                {billingStatus && !isBillingStatusLoading && (
                  <span className="hidden items-center gap-1 sm:inline-flex">
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-amber-900/20">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                        style={{ width: `${creditUsagePercent}%` }}
                      />
                    </span>
                    <Sparkles className="h-3 w-3 text-rose-600" aria-hidden="true" />
                  </span>
                )}
              </Link>
            )}

            {hasProTier ? (
              <Link href={billingCtaHref} className="hidden md:inline-flex">
                <Chip className="h-9 gap-1 border-emerald-500/30 bg-emerald-500/10 px-3 text-emerald-700">
                  <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                  Pro Plan
                </Chip>
              </Link>
            ) : (
              <Link href={billingCtaHref} className="hidden md:inline-flex">
                <Button
                  size="sm"
                  className={cn(
                    'h-9 rounded-full px-4 text-xs font-semibold text-white shadow-md',
                    hasBillingGroups
                      ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 shadow-orange-500/35 hover:brightness-105 hover:shadow-lg hover:shadow-orange-500/40'
                      : 'bg-gradient-to-r from-primary to-emerald-600 shadow-primary/35 hover:brightness-105 hover:shadow-lg hover:shadow-primary/40'
                  )}
                >
                  {hasBillingGroups && <Crown className="h-3.5 w-3.5" aria-hidden="true" />}
                  {billingCtaLabel}
                </Button>
              </Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden border-border/70 bg-card"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {navItems.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={cn(isActive(item.href) && 'font-semibold text-foreground')}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={billingCtaHref}>
                    {billingMenuLabel}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9 border border-border/70">
                    <AvatarFallback className="bg-surface-2 text-foreground font-semibold">
                      {user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="text-xs uppercase tracking-wide text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={billingCtaHref}>{billingMenuLabel}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Link href="/auth">
            <Button>Sign In</Button>
          </Link>
        )}
      </div>
      {loading ? (
        <div className="border-t border-border/70 bg-card/70 px-4 py-2 md:hidden sm:px-6" aria-hidden="true">
          <div className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto pb-1">
            <div className="h-8 w-20 animate-pulse rounded-full bg-muted/80" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-muted/80" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-muted/80" />
          </div>
        </div>
      ) : user ? (
        <div className="border-t border-border/70 bg-card/70 px-4 py-2 md:hidden sm:px-6">
          <div className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive(item.href)
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/70 bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  )
} 
