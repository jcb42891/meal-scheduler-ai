import 'server-only'

export type GroceryListEmailItem = {
  name: string
  total: number
  unit: string
}

export type SendGroceryListEmailInput = {
  toEmail: string
  listContextLabel: string
  items: GroceryListEmailItem[]
}

type SendGroceryListEmailResponse = {
  provider?: string
  id?: string
  error?: string
}

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase()
}

export async function sendGroceryListEmailUsingEdgeFunction(input: SendGroceryListEmailInput) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const inviteFunctionSecret = process.env.INVITE_FUNCTION_SECRET

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  }

  if (!inviteFunctionSecret) {
    throw new Error('INVITE_FUNCTION_SECRET is not set.')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-grocery-list-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-invite-secret': inviteFunctionSecret,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  })

  let payload: SendGroceryListEmailResponse | null = null
  try {
    payload = (await response.json()) as SendGroceryListEmailResponse
  } catch {
    payload = null
  }

  if (!response.ok) {
    const responseMessage =
      typeof payload?.error === 'string' && payload.error.trim().length > 0
        ? payload.error
        : `Grocery list email delivery failed with status ${response.status}.`
    throw new Error(responseMessage)
  }

  return {
    provider: payload?.provider ?? 'unknown',
    externalMessageId: payload?.id ?? null,
  }
}

