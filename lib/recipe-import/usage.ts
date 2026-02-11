import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportSourceType } from './types'

const DEFAULT_MONTHLY_CREDITS = 40
const DEFAULT_CREDITS_PER_IMPORT = 1

type UsageEventType = 'attempt' | 'success' | 'failure'

type CreditConsumptionRpcRow = {
  allowed: boolean | null
  required_credits: number | string | null
  period_start: string | null
  plan_tier: string | null
  monthly_credits: number | string | null
  used_credits: number | string | null
  remaining_credits: number | string | null
}

export type UsageEventInput = {
  requestId: string
  eventType: UsageEventType
  sourceType: ImportSourceType
  groupId: string
  userId: string
  statusCode?: number
  errorCode?: string
  errorMessage?: string
  provider?: string
  model?: string
  costCredits?: number
  costInputTokens?: number
  costOutputTokens?: number
  costTotalTokens?: number
  costUsd?: number
  latencyMs?: number
  inputBytes?: number
  outputIngredientsCount?: number
  warningsCount?: number
  confidence?: number | null
  metadata?: Record<string, unknown>
}

export type GroupCreditConsumptionResult = {
  allowed: boolean
  requiredCredits: number
  periodStart: string
  planTier: string
  monthlyCredits: number
  usedCredits: number
  remainingCredits: number
}

function asInteger(value: number | string | null | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.floor(parsed)
}

function getDefaultMonthlyCredits() {
  const value = Number(process.env.RECIPE_IMPORT_MONTHLY_CREDITS ?? DEFAULT_MONTHLY_CREDITS)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_MONTHLY_CREDITS
  return Math.floor(value)
}

function getSourceCreditCost(sourceType: ImportSourceType): number {
  const envKey =
    sourceType === 'image'
      ? 'RECIPE_IMPORT_CREDITS_IMAGE'
      : sourceType === 'url'
        ? 'RECIPE_IMPORT_CREDITS_URL'
        : 'RECIPE_IMPORT_CREDITS_TEXT'

  const value = Number(process.env[envKey] ?? DEFAULT_CREDITS_PER_IMPORT)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CREDITS_PER_IMPORT
  return Math.floor(value)
}

export async function recordImportUsageEvent(
  supabase: SupabaseClient,
  input: UsageEventInput,
): Promise<number> {
  const { data, error } = await supabase.rpc('record_import_usage_event', {
    p_request_id: input.requestId,
    p_event_type: input.eventType,
    p_source_type: input.sourceType,
    p_group_id: input.groupId,
    p_user_id: input.userId,
    p_status_code: input.statusCode ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_cost_credits: input.costCredits ?? 0,
    p_cost_input_tokens: input.costInputTokens ?? null,
    p_cost_output_tokens: input.costOutputTokens ?? null,
    p_cost_total_tokens: input.costTotalTokens ?? null,
    p_cost_usd: input.costUsd ?? null,
    p_latency_ms: input.latencyMs ?? null,
    p_input_bytes: input.inputBytes ?? null,
    p_output_ingredients_count: input.outputIngredientsCount ?? null,
    p_warnings_count: input.warningsCount ?? null,
    p_confidence: input.confidence ?? null,
    p_metadata: input.metadata ?? {},
  })

  if (error) {
    throw new Error(error.message || 'Unable to record import usage event.')
  }

  const value = Array.isArray(data) ? data[0] : data
  const eventId = asInteger(
    typeof value === 'number' || typeof value === 'string' ? value : null,
    Number.NaN,
  )

  if (!Number.isFinite(eventId) || eventId <= 0) {
    throw new Error('Usage event ledger returned an invalid event id.')
  }

  return eventId
}

export async function consumeGroupImportCredits(
  supabase: SupabaseClient,
  {
    groupId,
    sourceType,
    requestId,
    usageEventId,
  }: {
    groupId: string
    sourceType: ImportSourceType
    requestId: string
    usageEventId?: number
  },
): Promise<GroupCreditConsumptionResult> {
  const defaultMonthlyCredits = getDefaultMonthlyCredits()
  const requestedCredits = getSourceCreditCost(sourceType)
  const { data, error } = await supabase.rpc('consume_group_import_credits', {
    p_group_id: groupId,
    p_source_type: sourceType,
    p_credits: requestedCredits,
    p_request_id: requestId,
    p_usage_event_id: usageEventId ?? null,
    p_default_monthly_credits: defaultMonthlyCredits,
  })

  if (error) {
    throw new Error(error.message || 'Unable to consume import credits.')
  }

  const row = (Array.isArray(data) ? data[0] : data) as CreditConsumptionRpcRow | null | undefined
  if (!row || !row.period_start) {
    throw new Error('Credit accounting returned an empty response.')
  }

  return {
    allowed: row.allowed === true,
    requiredCredits: asInteger(row.required_credits, requestedCredits),
    periodStart: row.period_start,
    planTier: row.plan_tier?.trim() || 'free',
    monthlyCredits: asInteger(row.monthly_credits, defaultMonthlyCredits),
    usedCredits: Math.max(0, asInteger(row.used_credits, 0)),
    remainingCredits: Math.max(0, asInteger(row.remaining_credits, 0)),
  }
}
