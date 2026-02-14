export type MagicImportBillingStatusCtaInput = {
  allowed: boolean
  isUnlimited: boolean
  hasActiveSubscription: boolean
  billing: {
    stripeConfigured: boolean
    canManage: boolean
  }
}

export function getMagicImportBillingCtas(status: MagicImportBillingStatusCtaInput | null) {
  const canManageBilling = Boolean(
    status && status.billing.stripeConfigured && status.billing.canManage,
  )

  if (!canManageBilling || !status) {
    return {
      showUpgrade: false,
      showManage: false,
      showBlockedNotice: false,
    }
  }

  return {
    showUpgrade: !status.hasActiveSubscription,
    showManage: status.hasActiveSubscription,
    showBlockedNotice: !status.allowed && !status.isUnlimited,
  }
}
