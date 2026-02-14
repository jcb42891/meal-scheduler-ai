import { getDefaultMonthlyCredits } from '@/lib/recipe-import/usage'

const DEFAULT_PRO_MONTHLY_CREDITS = 400
const DEFAULT_GRACE_HOURS = 72

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

export function getStripeMagicImportPriceId() {
  return process.env.STRIPE_MAGIC_IMPORT_PRICE_ID?.trim() || null
}

export function getStripeMagicImportProductName() {
  return process.env.STRIPE_MAGIC_IMPORT_PRODUCT_NAME?.trim() || 'Magic Import Pro'
}

export function getProMonthlyCredits() {
  return parseNonNegativeInt(process.env.STRIPE_MAGIC_IMPORT_MONTHLY_CREDITS, DEFAULT_PRO_MONTHLY_CREDITS)
}

export function getFreeMonthlyCredits() {
  return getDefaultMonthlyCredits()
}

export function getBillingGraceHours() {
  return parseNonNegativeInt(process.env.BILLING_GRACE_HOURS, DEFAULT_GRACE_HOURS)
}

export function isStripeBillingConfigured() {
  return Boolean(getStripeMagicImportPriceId() && process.env.STRIPE_SECRET_KEY)
}

export function resolvePlanCodeForStripePrice(priceId: string | null | undefined) {
  const configuredPriceId = getStripeMagicImportPriceId()
  if (!priceId || !configuredPriceId) return 'free'
  return priceId === configuredPriceId ? 'pro' : 'free'
}
