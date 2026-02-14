// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockUser = { id: string; email?: string | null } | null

const authState = {
  user: { id: 'user-1', email: 'cook@example.com' } as MockUser,
}

const routerPushMock = vi.hoisted(() => vi.fn())
const searchParamsState = vi.hoisted(() => ({ tab: null as string | null }))
const supabaseFromMock = vi.hoisted(() => vi.fn())
const fetchMock = vi.hoisted(() => vi.fn())
const toastErrorMock = vi.hoisted(() => vi.fn())
const toastSuccessMock = vi.hoisted(() => vi.fn())

let profileResponse: { data: { first_name: string | null; last_name: string | null } | null }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams(searchParamsState.tab ? `tab=${searchParamsState.tab}` : ''),
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

vi.mock('@/lib/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: supabaseFromMock,
    auth: {
      resetPasswordForEmail: vi.fn(),
    },
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

import ProfilePage from './page'

function installSupabaseMocks() {
  supabaseFromMock.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(profileResponse),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    authState.user = { id: 'user-1', email: 'cook@example.com' }
    searchParamsState.tab = null
    profileResponse = {
      data: { first_name: 'Ava', last_name: 'Cook' },
    }
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        planTier: 'free',
        allowed: true,
        reasonCode: null,
        periodStart: '2026-02-01T00:00:00.000Z',
        monthlyCredits: 40,
        usedCredits: 11,
        remainingCredits: 29,
        requiredCredits: 1,
        isUnlimited: false,
        hasActiveSubscription: false,
        graceActive: false,
        isEnvOverride: false,
        billing: {
          stripeConfigured: true,
          canManage: true,
        },
      }),
    })
    installSupabaseMocks()
  })

  it('opens on the billing tab with account-level billing content by default', async () => {
    render(<ProfilePage />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/billing/status?sourceType=url')
    })

    expect(screen.getByText('Billing Command Center')).toBeInTheDocument()
    expect(screen.getByText('Track account credits, manage your plan, and upgrade in one place.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upgrade to Pro' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset Password' })).not.toBeInTheDocument()
  })

  it('supports deep-linking to the account tab with query params', async () => {
    searchParamsState.tab = 'account'
    render(<ProfilePage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset Password' })).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: 'Account Details' })).toBeInTheDocument()
    expect(screen.queryByText('Track account credits, manage your plan, and upgrade in one place.')).not.toBeInTheDocument()
  })

  it('shows account-level blocked copy when credits are exhausted', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        planTier: 'free',
        allowed: false,
        reasonCode: 'quota_exceeded',
        periodStart: '2026-02-01T00:00:00.000Z',
        monthlyCredits: 40,
        usedCredits: 40,
        remainingCredits: 0,
        requiredCredits: 1,
        isUnlimited: false,
        hasActiveSubscription: false,
        graceActive: false,
        isEnvOverride: false,
        billing: {
          stripeConfigured: true,
          canManage: true,
        },
      }),
    })

    render(<ProfilePage />)

    expect(
      await screen.findByText('Magic Import is currently blocked for your account. Upgrading to Pro restores access.'),
    ).toBeInTheDocument()
  })
})
