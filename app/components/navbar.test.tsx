// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockUser = { email?: string | null } | null

const authState = {
  user: null as MockUser,
  signOut: vi.fn(),
  loading: false,
}

let pathname = '/'
const supabaseFromMock = vi.hoisted(() => vi.fn())
const fetchMock = vi.hoisted(() => vi.fn())

let ownedGroupsResponse: { data: Array<{ id: string; name: string }> | null; error: { message: string } | null }
let memberGroupsResponse: { data: Array<{ group: { id: string; name: string } }> | null; error: { message: string } | null }

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

vi.mock('@/lib/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: supabaseFromMock,
  },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: React.ReactNode }) => {
    const normalizedHref = typeof href === 'string' ? href : href?.pathname ?? ''
    return (
      <a href={normalizedHref} {...props}>
        {children}
      </a>
    )
  },
}))

import { Navbar } from './navbar'
import { BILLING_GROUPS_UPDATED_EVENT, BILLING_STATUS_UPDATED_EVENT } from '@/lib/billing/client'

function installSupabaseMocks() {
  supabaseFromMock.mockImplementation((table: string) => {
    if (table === 'groups') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(ownedGroupsResponse),
        }),
      }
    }

    if (table === 'group_members') {
      const builder = {
        eq: vi.fn().mockReturnThis(),
        returns: vi.fn().mockResolvedValue(memberGroupsResponse),
      }

      return {
        select: vi.fn().mockReturnValue(builder),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('Navbar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    authState.user = null
    authState.loading = false
    authState.signOut.mockReset()
    pathname = '/'
    ownedGroupsResponse = {
      data: [],
      error: null,
    }
    memberGroupsResponse = {
      data: [],
      error: null,
    }
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        planTier: 'free',
        hasActiveSubscription: false,
        monthlyCredits: 40,
        remainingCredits: 33,
      }),
    })
    installSupabaseMocks()
  })

  it('shows sign-in action when unauthenticated', () => {
    render(<Navbar />)

    const signInLink = screen.getByRole('link', { name: 'Sign In' })
    expect(signInLink).toHaveAttribute('href', '/auth')
    expect(screen.queryByRole('link', { name: 'Calendar' })).not.toBeInTheDocument()
  })

  it('shows loading skeletons while auth state is loading', () => {
    authState.loading = true
    const { container } = render(<Navbar />)

    expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
  })

  it('renders navigation links for authenticated users and highlights active route', () => {
    authState.user = { email: 'cook@example.com' }
    pathname = '/meals'
    ownedGroupsResponse = {
      data: [{ id: 'group-1', name: 'Family' }],
      error: null,
    }
    installSupabaseMocks()

    render(<Navbar />)

    expect(screen.getByRole('link', { name: 'Pantry Planner' })).toHaveAttribute('href', '/')
    const mealLibraryLinks = screen.getAllByRole('link', { name: 'Meal Library' })
    expect(mealLibraryLinks.length).toBeGreaterThan(0)
    expect(
      mealLibraryLinks.some(
        (link) =>
          link.className.includes('bg-primary text-primary-foreground') ||
          link.className.includes('border-primary/40 bg-primary/10 text-primary'),
      ),
    ).toBe(true)
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument()
  })

  it('shows billing credits and upgrade links for authenticated users', async () => {
    authState.user = { email: 'cook@example.com' }
    ownedGroupsResponse = {
      data: [{ id: 'group-1', name: 'Family' }],
      error: null,
    }
    installSupabaseMocks()

    render(<Navbar />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/billing/status?groupId=group-1&sourceType=url',
      )
    })

    const creditsLink = screen.getByRole('link', { name: '33/40 credits' })
    expect(creditsLink).toHaveAttribute('href', '/profile?tab=billing')
    expect(creditsLink.className).toContain('from-amber-100')
    expect(creditsLink.className).toContain('to-rose-100')

    const upgradeButton = screen.getByRole('button', { name: 'Upgrade to Pro' })
    expect(upgradeButton.className).toContain('from-amber-500')
    expect(upgradeButton.className).toContain('to-rose-500')
    expect(screen.getAllByRole('link', { name: 'Upgrade to Pro' }).length).toBeGreaterThan(0)
  })

  it('shows a pro plan chip instead of upgrade links for subscribed users', async () => {
    authState.user = { email: 'cook@example.com' }
    ownedGroupsResponse = {
      data: [{ id: 'group-1', name: 'Family' }],
      error: null,
    }
    installSupabaseMocks()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        planTier: 'pro',
        hasActiveSubscription: true,
        monthlyCredits: 200,
        remainingCredits: 180,
      }),
    })

    render(<Navbar />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/billing/status?groupId=group-1&sourceType=url')
    })

    expect(screen.getByRole('link', { name: 'Pro Plan' })).toHaveAttribute('href', '/profile?tab=billing')
    const proCreditsLink = screen.getByRole('link', { name: '180/200 credits' })
    expect(proCreditsLink).toHaveAttribute('href', '/profile?tab=billing')
    expect(proCreditsLink.className).toContain('from-amber-100')
    expect(proCreditsLink.className).toContain('to-rose-100')
    expect(screen.queryByRole('link', { name: 'Upgrade to Pro' })).not.toBeInTheDocument()
  })

  it('shows create-group billing CTA when authenticated user has no groups', async () => {
    authState.user = { email: 'new-user@example.com' }
    ownedGroupsResponse = {
      data: [],
      error: null,
    }
    memberGroupsResponse = {
      data: [],
      error: null,
    }
    installSupabaseMocks()

    render(<Navbar />)

    await waitFor(() => {
      expect(supabaseFromMock).toHaveBeenCalledWith('groups')
      expect(supabaseFromMock).toHaveBeenCalledWith('group_members')
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Create Group to Upgrade' })).toHaveAttribute('href', '/groups')
    expect(screen.queryByText('credits', { exact: false })).not.toBeInTheDocument()
  })

  it('refreshes billing controls when groups are updated after initial load', async () => {
    authState.user = { email: 'new-user@example.com' }
    ownedGroupsResponse = {
      data: [],
      error: null,
    }
    memberGroupsResponse = {
      data: [],
      error: null,
    }
    installSupabaseMocks()

    render(<Navbar />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Create Group to Upgrade' })).toBeInTheDocument()
    })

    ownedGroupsResponse = {
      data: [{ id: 'group-1', name: 'Family' }],
      error: null,
    }
    memberGroupsResponse = {
      data: [],
      error: null,
    }
    window.dispatchEvent(new CustomEvent(BILLING_GROUPS_UPDATED_EVENT, { detail: { groupId: 'group-1' } }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/billing/status?groupId=group-1&sourceType=url')
    })

    expect(screen.getByRole('link', { name: '33/40 credits' })).toHaveAttribute('href', '/profile?tab=billing')
    expect(screen.getAllByRole('link', { name: 'Upgrade to Pro' }).length).toBeGreaterThan(0)
  })

  it('refreshes billing credits when billing status updates for the active group', async () => {
    authState.user = { email: 'cook@example.com' }
    ownedGroupsResponse = {
      data: [{ id: 'group-1', name: 'Family' }],
      error: null,
    }
    installSupabaseMocks()
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          planTier: 'free',
          hasActiveSubscription: false,
          monthlyCredits: 40,
          remainingCredits: 33,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          planTier: 'free',
          hasActiveSubscription: false,
          monthlyCredits: 40,
          remainingCredits: 31,
        }),
      })

    render(<Navbar />)

    expect(await screen.findByRole('link', { name: '33/40 credits' })).toBeInTheDocument()

    window.dispatchEvent(new CustomEvent(BILLING_STATUS_UPDATED_EVENT, { detail: { groupId: 'group-1' } }))

    expect(await screen.findByRole('link', { name: '31/40 credits' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/billing/status?groupId=group-1&sourceType=url')
  })
})
