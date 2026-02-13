const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-invite-secret',
}

export {}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

type GroceryListEmailItem = {
  name: string
  total: number
  unit: string
}

type GroceryListEmailPayload = {
  toEmail?: string
  listContextLabel?: string
  items?: GroceryListEmailItem[]
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isValidItem(item: GroceryListEmailItem) {
  if (!item || typeof item !== 'object') return false
  if (typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.trim().length > 120) return false
  if (typeof item.total !== 'number' || !Number.isFinite(item.total) || item.total < 0) return false
  if (typeof item.unit !== 'string' || item.unit.trim().length > 40) return false
  return true
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  const expectedInternalSecret = Deno.env.get('INVITE_FUNCTION_SECRET')
  if (!expectedInternalSecret) {
    return jsonResponse(500, { error: 'INVITE_FUNCTION_SECRET is not configured.' })
  }

  const providedInternalSecret = request.headers.get('x-internal-invite-secret')
  if (!providedInternalSecret || providedInternalSecret !== expectedInternalSecret) {
    return jsonResponse(401, { error: 'Unauthorized.' })
  }

  let payload: GroceryListEmailPayload
  try {
    payload = (await request.json()) as GroceryListEmailPayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload.' })
  }

  const toEmail = normalizeEmail(payload.toEmail ?? '')
  const listContextLabel = (payload.listContextLabel ?? '').trim()
  const items = payload.items ?? []

  if (!isValidEmail(toEmail)) {
    return jsonResponse(400, { error: 'A valid recipient email is required.' })
  }

  if (!listContextLabel || listContextLabel.length > 120) {
    return jsonResponse(400, { error: 'listContextLabel is required and must be 120 characters or fewer.' })
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 300) {
    return jsonResponse(400, { error: 'items must be a non-empty array with at most 300 entries.' })
  }

  if (!items.every(isValidItem)) {
    return jsonResponse(400, { error: 'One or more grocery list items are invalid.' })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const inviteFromEmail = Deno.env.get('INVITE_FROM_EMAIL')
  const inviteReplyToEmail = Deno.env.get('INVITE_REPLY_TO_EMAIL') ?? undefined

  if (!resendApiKey || !inviteFromEmail) {
    return jsonResponse(500, { error: 'RESEND_API_KEY and INVITE_FROM_EMAIL must be configured.' })
  }

  const safeContext = escapeHtml(listContextLabel)
  const lines = items.map((item) => `${item.name}: ${item.total}${item.unit ? ` ${item.unit}` : ''}`)
  const safeRows = items
    .map((item) => {
      const qty = `${item.total}${item.unit ? ` ${item.unit}` : ''}`
      return `<li style="margin: 0 0 8px;"><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(qty)}</li>`
    })
    .join('')

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5; max-width: 560px;">
      <h2 style="margin: 0 0 12px;">Your Grocery List</h2>
      <p style="margin: 0 0 10px;">Context: <strong>${safeContext}</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        ${safeRows}
      </ul>
    </div>
  `

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: inviteFromEmail,
      to: [toEmail],
      reply_to: inviteReplyToEmail,
      subject: `Your grocery list (${listContextLabel})`,
      html,
      text: [`Your Grocery List`, `Context: ${listContextLabel}`, '', ...lines].join('\n'),
    }),
  })

  let resendPayload: { id?: string; message?: string; error?: { message?: string } } | null = null
  try {
    resendPayload = (await resendResponse.json()) as {
      id?: string
      message?: string
      error?: { message?: string }
    }
  } catch {
    resendPayload = null
  }

  if (!resendResponse.ok) {
    const errorMessage =
      resendPayload?.error?.message || resendPayload?.message || 'Email provider request failed.'
    return jsonResponse(502, { error: errorMessage })
  }

  return jsonResponse(200, {
    success: true,
    provider: 'resend',
    id: resendPayload?.id ?? null,
  })
})
