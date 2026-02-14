import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { assertUserCanManageGroupBilling, syncGroupSubscriptionFromStripe } from './server'

type GroupQueryResult = {
  data: { id: string; owner_id: string } | null
  error: { message: string } | null
}

type MemberQueryResult = {
  data: { group_id: string } | null
  error: { message: string } | null
}

function createSupabaseMock({
  groupResult,
  memberResult,
}: {
  groupResult: GroupQueryResult
  memberResult: MemberQueryResult
}) {
  const groupQuery = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(groupResult),
  }

  const memberQuery = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(memberResult),
  }

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: vi.fn().mockReturnValue(groupQuery),
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

describe('assertUserCanManageGroupBilling', () => {
  it('returns the group for owners', async () => {
    const supabase = createSupabaseMock({
      groupResult: {
        data: { id: 'group-1', owner_id: 'owner-1' },
        error: null,
      },
      memberResult: {
        data: null,
        error: null,
      },
    })

    const result = await assertUserCanManageGroupBilling(supabase, 'group-1', 'owner-1')

    expect(result).toEqual({ id: 'group-1', owner_id: 'owner-1' })
  })

  it('returns the group for non-owner members', async () => {
    const supabase = createSupabaseMock({
      groupResult: {
        data: { id: 'group-1', owner_id: 'owner-1' },
        error: null,
      },
      memberResult: {
        data: { group_id: 'group-1' },
        error: null,
      },
    })

    const result = await assertUserCanManageGroupBilling(supabase, 'group-1', 'member-1')

    expect(result).toEqual({ id: 'group-1', owner_id: 'owner-1' })
  })

  it('returns null when the user is neither owner nor member', async () => {
    const supabase = createSupabaseMock({
      groupResult: {
        data: { id: 'group-1', owner_id: 'owner-1' },
        error: null,
      },
      memberResult: {
        data: null,
        error: null,
      },
    })

    const result = await assertUserCanManageGroupBilling(supabase, 'group-1', 'outsider-1')

    expect(result).toBeNull()
  })

  it('returns null when the group does not exist', async () => {
    const supabase = createSupabaseMock({
      groupResult: {
        data: null,
        error: null,
      },
      memberResult: {
        data: { group_id: 'group-1' },
        error: null,
      },
    })

    const result = await assertUserCanManageGroupBilling(supabase, 'group-1', 'member-1')

    expect(result).toBeNull()
  })

  it('throws when group lookup fails', async () => {
    const supabase = createSupabaseMock({
      groupResult: {
        data: null,
        error: { message: 'group query failed' },
      },
      memberResult: {
        data: null,
        error: null,
      },
    })

    await expect(assertUserCanManageGroupBilling(supabase, 'group-1', 'member-1')).rejects.toMatchObject({
      message: 'group query failed',
    })
  })

  it('throws when membership lookup fails', async () => {
    const supabase = createSupabaseMock({
      groupResult: {
        data: { id: 'group-1', owner_id: 'owner-1' },
        error: null,
      },
      memberResult: {
        data: null,
        error: { message: 'membership query failed' },
      },
    })

    await expect(assertUserCanManageGroupBilling(supabase, 'group-1', 'member-1')).rejects.toMatchObject({
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
  planMonthlyCredits = 400,
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
}: {
  status: Stripe.Subscription.Status
  currentPeriodEnd: number
}) {
  return {
    id: 'sub_123',
    status,
    customer: 'cus_123',
    cancel_at_period_end: false,
    metadata: {
      group_id: 'group-1',
    },
    items: {
      data: [
        {
          price: {
            id: 'price_pro',
          },
          current_period_start: currentPeriodEnd - 3600,
          current_period_end: currentPeriodEnd,
        },
      ],
    },
  } as unknown as Stripe.Subscription
}

describe('syncGroupSubscriptionFromStripe', () => {
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

    await syncGroupSubscriptionFromStripe(supabase, {
      subscription,
      groupId: 'group-1',
    })

    expect(subscriptionsUpsertMock).toHaveBeenCalledTimes(1)
    const subscriptionsUpsertPayload = subscriptionsUpsertMock.mock.calls[0]?.[0]
    expect(subscriptionsUpsertPayload).toMatchObject({
      group_id: 'group-1',
      status: 'canceled',
      grace_until: null,
    })

    expect(rpcMock).toHaveBeenCalledWith('sync_group_import_account_for_plan', expect.objectContaining({
      p_group_id: 'group-1',
      p_plan_tier: 'free',
      p_preserve_current_period_allocation: false,
    }))
  })

  it('keeps paid plan during grace for past_due subscriptions', async () => {
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 60
    const subscription = createStripeSubscription({
      status: 'past_due',
      currentPeriodEnd,
    })
    const { supabase, subscriptionsUpsertMock, rpcMock } = createPlanSyncSupabaseMock()

    await syncGroupSubscriptionFromStripe(supabase, {
      subscription,
      groupId: 'group-1',
    })

    expect(subscriptionsUpsertMock).toHaveBeenCalledTimes(1)
    const subscriptionsUpsertPayload = subscriptionsUpsertMock.mock.calls[0]?.[0]
    expect(subscriptionsUpsertPayload).toMatchObject({
      group_id: 'group-1',
      status: 'past_due',
    })
    expect(subscriptionsUpsertPayload.grace_until).toEqual(expect.any(String))

    expect(rpcMock).toHaveBeenCalledWith('sync_group_import_account_for_plan', expect.objectContaining({
      p_group_id: 'group-1',
      p_plan_tier: 'pro',
      p_preserve_current_period_allocation: true,
    }))
  })
})
