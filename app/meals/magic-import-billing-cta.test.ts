import { describe, expect, it } from 'vitest'
import { getMagicImportBillingCtas } from './magic-import-billing-cta'

describe('getMagicImportBillingCtas', () => {
  it('shows upgrade CTA when a group member can manage billing and is not subscribed', () => {
    expect(
      getMagicImportBillingCtas({
        allowed: true,
        isUnlimited: false,
        hasActiveSubscription: false,
        billing: {
          stripeConfigured: true,
          canManage: true,
        },
      }),
    ).toEqual({
      showUpgrade: true,
      showManage: false,
      showBlockedNotice: false,
    })
  })

  it('shows manage CTA when a group member has active subscription', () => {
    expect(
      getMagicImportBillingCtas({
        allowed: true,
        isUnlimited: false,
        hasActiveSubscription: true,
        billing: {
          stripeConfigured: true,
          canManage: true,
        },
      }),
    ).toEqual({
      showUpgrade: false,
      showManage: true,
      showBlockedNotice: false,
    })
  })

  it('shows blocked notice while still allowing upgrade CTA when out of credits', () => {
    expect(
      getMagicImportBillingCtas({
        allowed: false,
        isUnlimited: false,
        hasActiveSubscription: false,
        billing: {
          stripeConfigured: true,
          canManage: true,
        },
      }),
    ).toEqual({
      showUpgrade: true,
      showManage: false,
      showBlockedNotice: true,
    })
  })

  it('hides all billing CTAs when user cannot manage billing', () => {
    expect(
      getMagicImportBillingCtas({
        allowed: false,
        isUnlimited: false,
        hasActiveSubscription: false,
        billing: {
          stripeConfigured: true,
          canManage: false,
        },
      }),
    ).toEqual({
      showUpgrade: false,
      showManage: false,
      showBlockedNotice: false,
    })
  })
})
