import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { assertUserCanAccessGroup, syncUserSubscriptionFromStripe } from './server'

type OwnerQueryResult = {
  data: { id: string } | null
  error: { message: string } | null
}

type MemberQueryResult = {
  data: { group_id: string } | null
  error: { message: string } | null
}

function createAccessSupabaseMock({
  ownerResult,
  memberResult,
}: {
  ownerResult: OwnerQueryResult
  memberResult: MemberQueryResult
}) {
  const ownerQuery = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(ownerResult),
  }

  const memberQuery = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(memberResult),
  }

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: vi.fn().mockReturnValue(ownerQuery),
        }
      }

      if (table === 'group_members') {
        return {
          select: vi.fn().mockReturnValue(memberQuery),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return supabase as never
}

describe('assertUserCanAccessGroup', () => {
  it('returns true for owners', async () => {
    const supabase = createAccessSupabaseMock({
      ownerResult: {
        data: { id: 'group-1' },
        error: null,
      },
      memberResult: {
        data: null,
        error: null,
      },
    })

    const result = await assertUserCanAccessGroup(supabase, 'group-1', 'owner-1')

    expect(result).toBe(true)
  })

  it('returns true for members', async () => {
    const supabase = createAccessSupabaseMock({
      ownerResult: {
        data: null,
        error: null,
      },
      memberResult: {
        data: { group_id: 'group-1' },
        error: null,
      },
    })

    const result = await assertUserCanAccessGroup(supabase, 'group-1', 'member-1')

    expect(result).toBe(true)
  })

  it('returns false when the user has no ownership or membership', async () => {
    const supabase = createAccessSupabaseMock({
      ownerResult: {
        data: null,
        error: null,
      },
      memberResult: {
        data: null,
        error: null,
      },
    })

    const result = await assertUserCanAccessGroup(supabase, 'group-1', 'outsider-1')

    expect(result).toBe(false)
  })

  it('throws when membership lookup fails', async () => {
    const supabase = createAccessSupabaseMock({
      ownerResult: {
        data: null,
        error: null,
      },
      memberResult: {
        data: null,
        error: { message: 'membership query failed' },
      },
    })

    await expect(assertUserCanAccessGroup(supabase, 'group-1', 'member-1')).rejects.toMatchObject({
      message: 'membership query failed',
    })
  })
})

type PlanSyncMock = {
  supabase: never
  subscriptionsUpsertMock: ReturnType<typeof vi.fn>
  rpcMock: ReturnType<typeof vi.fn>
}

function createPlanSyncSupabaseMock({
  planMonthlyCredits = 300,
}: {
  planMonthlyCredits?: number
} = {}): PlanSyncMock {
  const planSelectSingleMock = vi.fn().mockResolvedValue({
    data: {
      id: 'plan-pro',
      code: 'pro',
      monthly_credits: planMonthlyCredits,
    },
    error: null,
  })

  const planSelectMock = vi.fn().mockReturnValue({
    single: planSelectSingleMock,
  })

  const plansUpsertMock = vi.fn().mockReturnValue({
    select: planSelectMock,
  })

  const subscriptionsUpsertMock = vi.fn().mockResolvedValue({
    error: null,
  })

  const rpcMock = vi.fn().mockResolvedValue({
    error: null,
  })

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'plans') {
        return {
          upsert: plansUpsertMock,
        }
      }

      if (table === 'subscriptions') {
        return {
          upsert: subscriptionsUpsertMock,
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
    rpc: rpcMock,
  }

  return {
    supabase: supabase as never,
    subscriptionsUpsertMock,
    rpcMock,
  }
}

function createStripeSubscription({
  status,
  currentPeriodEnd,
  priceId = 'price_pro',
}: {
  status: Stripe.Subscription.Status
  currentPeriodEnd: number
  priceId?: string
}) {
  return {
    id: 'sub_123',
    status,
    customer: 'cus_123',
    cancel_at_period_end: false,
    metadata: {
      user_id: 'user-1',
    },
    items: {
      data: [
        {
          price: {
            id: priceId,
          },
          current_period_start: currentPeriodEnd - 3600,
          current_period_end: currentPeriodEnd,
        },
      ],
    },
  } as unknown as Stripe.Subscription
}

describe('syncUserSubscriptionFromStripe', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('STRIPE_MAGIC_IMPORT_PRICE_ID', 'price_pro')
  })

  it('does not apply grace for canceled subscriptions', async () => {
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 60
    const subscription = createStripeSubscription({
      status: 'canceled',
      currentPeriodEnd,
    })
    const { supabase, subscriptionsUpsertMock, rpcMock } = createPlanSyncSupabaseMock()

    await syncUserSubscriptionFromStripe(supabase, {
      subscription,
      userId: 'user-1',
    })

    expect(subscriptionsUpsertMock).toHaveBeenCalledTimes(1)
    const subscriptionsUpsertPayload = subscriptionsUpsertMock.mock.calls[0]?.[0]
    expect(subscriptionsUpsertPayload).toMatchObject({
      user_id: 'user-1',
      status: 'canceled',
      grace_until: null,
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'sync_user_import_account_for_plan',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_plan_tier: 'free',
        p_preserve_current_period_allocation: false,
      }),
    )
  })

  it('keeps paid plan during grace for past_due subscriptions', async () => {
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 60
    const subscription = createStripeSubscription({
      status: 'past_due',
      currentPeriodEnd,
    })
    const { supabase, subscriptionsUpsertMock, rpcMock } = createPlanSyncSupabaseMock()

    await syncUserSubscriptionFromStripe(supabase, {
      subscription,
      userId: 'user-1',
    })

    expect(subscriptionsUpsertMock).toHaveBeenCalledTimes(1)
    const subscriptionsUpsertPayload = subscriptionsUpsertMock.mock.calls[0]?.[0]
    expect(subscriptionsUpsertPayload).toMatchObject({
      user_id: 'user-1',
      status: 'past_due',
    })
    expect(subscriptionsUpsertPayload.grace_until).toEqual(expect.any(String))

    expect(rpcMock).toHaveBeenCalledWith(
      'sync_user_import_account_for_plan',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_plan_tier: 'pro',
        p_preserve_current_period_allocation: true,
      }),
    )
  })

  it('treats active subscriptions as pro even when Stripe price id does not match env', async () => {
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 60
    const subscription = createStripeSubscription({
      status: 'active',
      currentPeriodEnd,
      priceId: 'price_legacy_pro',
    })
    const { supabase, rpcMock } = createPlanSyncSupabaseMock()

    await syncUserSubscriptionFromStripe(supabase, {
      subscription,
      userId: 'user-1',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'sync_user_import_account_for_plan',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_plan_tier: 'pro',
        p_preserve_current_period_allocation: true,
      }),
    )
  })

  it('falls back to table sync when rpc hits account_id ambiguity', async () => {
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 60
    const subscription = createStripeSubscription({
      status: 'active',
      currentPeriodEnd,
    })

    const planSelectSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'plan-pro',
        code: 'pro',
        monthly_credits: 300,
      },
      error: null,
    })
    const planSelectMock = vi.fn().mockReturnValue({
      single: planSelectSingleMock,
    })
    const plansUpsertMock = vi.fn().mockReturnValue({
      select: planSelectMock,
    })

    const subscriptionsUpsertMock = vi.fn().mockResolvedValue({
      error: null,
    })

    const importAccountsSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'account-1',
        plan_tier: 'pro',
        monthly_credits: 300,
      },
      error: null,
    })
    const importAccountsSelectMock = vi.fn().mockReturnValue({
      single: importAccountsSingleMock,
    })
    const importAccountsUpsertMock = vi.fn().mockReturnValue({
      select: importAccountsSelectMock,
    })

    const ledgerInsertMock = vi.fn().mockResolvedValue({
      error: null,
    })
    const ledgerMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        credits_delta: 120,
      },
      error: null,
    })
    const ledgerSelectMatchMock = vi.fn().mockReturnValue({
      maybeSingle: ledgerMaybeSingleMock,
    })
    const ledgerSelectMock = vi.fn().mockReturnValue({
      match: ledgerSelectMatchMock,
    })
    const ledgerUpdateMatchMock = vi.fn().mockResolvedValue({
      error: null,
    })
    const ledgerUpdateMock = vi.fn().mockReturnValue({
      match: ledgerUpdateMatchMock,
    })

    const rpcMock = vi.fn().mockResolvedValue({
      error: {
        message: 'column reference "account_id" is ambiguous',
      },
    })

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'plans') {
          return {
            upsert: plansUpsertMock,
          }
        }

        if (table === 'subscriptions') {
          return {
            upsert: subscriptionsUpsertMock,
          }
        }

        if (table === 'import_credit_accounts') {
          return {
            upsert: importAccountsUpsertMock,
          }
        }

        if (table === 'import_credit_ledger') {
          return {
            insert: ledgerInsertMock,
            select: ledgerSelectMock,
            update: ledgerUpdateMock,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      rpc: rpcMock,
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await syncUserSubscriptionFromStripe(supabase as never, {
      subscription,
      userId: 'user-1',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'sync_user_import_account_for_plan',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_plan_tier: 'pro',
      }),
    )
    expect(importAccountsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        plan_tier: 'pro',
        monthly_credits: 300,
      }),
      { onConflict: 'user_id' },
    )
    expect(ledgerInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'account-1',
        entry_type: 'monthly_allocation',
      }),
    )
    expect(ledgerUpdateMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'account-1',
        entry_type: 'monthly_allocation',
      }),
    )
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
