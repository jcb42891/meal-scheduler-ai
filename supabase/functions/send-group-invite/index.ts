const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-invite-secret',
}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

type InviteEmailPayload = {
  toEmail?: string
  groupName?: string
  inviterEmail?: string
  inviteUrl?: string
  expiresAt?: string
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

function toDisplayDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'soon'
  }

  return parsed.toUTCString()
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

  let payload: InviteEmailPayload
  try {
    payload = (await request.json()) as InviteEmailPayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload.' })
  }

  const toEmail = normalizeEmail(payload.toEmail ?? '')
  const inviterEmail = normalizeEmail(payload.inviterEmail ?? '')
  const groupName = (payload.groupName ?? '').trim()
  const inviteUrl = (payload.inviteUrl ?? '').trim()
  const expiresAt = (payload.expiresAt ?? '').trim()

  if (!isValidEmail(toEmail)) {
    return jsonResponse(400, { error: 'A valid recipient email is required.' })
  }

  if (!groupName) {
    return jsonResponse(400, { error: 'groupName is required.' })
  }

  if (!inviteUrl || !inviteUrl.startsWith('http')) {
    return jsonResponse(400, { error: 'A valid inviteUrl is required.' })
  }

  if (!expiresAt) {
    return jsonResponse(400, { error: 'expiresAt is required.' })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const inviteFromEmail = Deno.env.get('INVITE_FROM_EMAIL')
  const inviteReplyToEmail = Deno.env.get('INVITE_REPLY_TO_EMAIL') ?? undefined

  if (!resendApiKey || !inviteFromEmail) {
    return jsonResponse(500, { error: 'RESEND_API_KEY and INVITE_FROM_EMAIL must be configured.' })
  }

  const safeGroupName = escapeHtml(groupName)
  const safeInviterEmail = escapeHtml(inviterEmail || 'A group admin')
  const safeInviteUrl = escapeHtml(inviteUrl)
  const safeExpiryDate = escapeHtml(toDisplayDate(expiresAt))

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5; max-width: 560px;">
      <h2 style="margin: 0 0 12px;">You have been invited to Pantry Planner</h2>
      <p style="margin: 0 0 10px;">
        <strong>${safeInviterEmail}</strong> invited you to join the group <strong>${safeGroupName}</strong>.
      </p>
      <p style="margin: 0 0 18px;">This link expires on <strong>${safeExpiryDate}</strong>.</p>
      <p style="margin: 0 0 20px;">
        <a
          href="${safeInviteUrl}"
          style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px;"
        >
          Accept Invitation
        </a>
      </p>
      <p style="margin: 0; font-size: 13px; color: #6B7280;">
        If the button does not work, copy this link into your browser:<br />
        <span style="word-break: break-all;">${safeInviteUrl}</span>
      </p>
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
      subject: `${groupName} invited you to Pantry Planner`,
      html,
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
