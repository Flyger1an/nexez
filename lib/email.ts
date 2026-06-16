import 'server-only'
// Gated transactional email (Resend-compatible). Dormant unless RESEND_API_KEY
// is set — like the other gated integrations (LLM, Stripe, Vercel). When unset,
// sendEmail is a no-op so the rest of the flow is unaffected.

export function hasEmailEnv(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

type SendEmailInput = { to: string; subject: string; html: string; text?: string }
type SendResult = { ok: boolean; skipped?: boolean; id?: string; error?: string }

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!hasEmailEnv()) return { ok: false, skipped: true }
  if (!input.to) return { ok: false, error: 'missing recipient' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Nexez <notifications@nexez.app>',
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `resend ${res.status}: ${body.slice(0, 200)}` }
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: data?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

// Pure builder (testable) for the "new booking" email (Calendly etc.).
export function buildBookingEmail(opts: {
  businessName: string
  eventName: string
  inviteeName?: string | null
  inviteeEmail?: string | null
  startTime?: string | null
  source?: string | null
  inboxUrl: string
}): { subject: string; html: string; text: string } {
  const { businessName, eventName, inviteeName, inviteeEmail, startTime, source, inboxUrl } = opts
  const subject = `New booking: ${eventName}`
  const when = startTime ? new Date(startTime).toLocaleString() : null
  const rows: [string, string | null | undefined][] = [
    ['Booking', eventName],
    ['Guest', inviteeName],
    ['Email', inviteeEmail],
    ['When', when],
    ['Source', source],
  ]
  const present = rows.filter(([, v]) => v)
  const text = [
    `You have a new booking on your Nexez page "${businessName}".`,
    '',
    ...present.map(([k, v]) => `${k}: ${v}`),
    '',
    `Manage it: ${inboxUrl}`,
  ].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0a0a0a">
  <h2 style="margin:0 0 8px">New booking</h2>
  <p style="margin:0 0 12px">A new booking came in on your Nexez page <strong>${escapeHtml(businessName)}</strong>.</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${present
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#52525b">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`,
    )
    .join('')}</table>
  <p style="margin:0"><a href="${inboxUrl}" style="display:inline-block;background:#10B981;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open your dashboard</a></p>
</div>`
  return { subject, html, text }
}

// Pure builder (testable) for the "buyer funded the escrow" seller notification,
// sent from the Stripe webhook when a negotiated deal is paid. `held` = a manual-
// capture hold the owner still needs to capture on delivery; otherwise it's already
// captured (auto-settle). `amount` is pre-formatted + currency-aware by the caller.
export function buildEscrowFundedEmail(opts: {
  businessName: string
  offerName: string
  amount: string
  held: boolean
  buyerAgent?: string | null
  inboxUrl: string
}): { subject: string; html: string; text: string } {
  const { businessName, offerName, amount, held, buyerAgent, inboxUrl } = opts
  const subject = held ? `Payment held in escrow: ${offerName}` : `Payment received: ${offerName}`
  const lead = held
    ? `A buyer funded an escrow hold on your Nexez page "${businessName}". Capture it from your inbox once you've delivered.`
    : `A buyer paid for an agreement on your Nexez page "${businessName}".`
  const rows: [string, string | null | undefined][] = [
    ['Offer', offerName],
    ['Amount', amount],
    ['Status', held ? 'Held in escrow (awaiting your capture)' : 'Captured'],
    ['From agent', buyerAgent],
  ]
  const present = rows.filter(([, v]) => v)
  const text = [
    lead,
    '',
    ...present.map(([k, v]) => `${k}: ${v}`),
    '',
    `Manage it: ${inboxUrl}`,
  ].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0a0a0a">
  <h2 style="margin:0 0 8px">${held ? 'Payment held in escrow' : 'Payment received'}</h2>
  <p style="margin:0 0 12px">${escapeHtml(lead)}</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${present
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#52525b">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`,
    )
    .join('')}</table>
  <p style="margin:0"><a href="${inboxUrl}" style="display:inline-block;background:#10B981;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open your negotiation inbox</a></p>
</div>`
  return { subject, html, text }
}

// Pure builder (testable) for refund / dispute seller notifications, fired from the
// Stripe webhook reversal handlers. `kind` drives urgency + copy; `detail` is an
// optional extra line (dispute reason, or won/lost outcome). `amount` is pre-formatted.
export function buildMoneyEventEmail(opts: {
  kind: 'refund' | 'dispute_opened' | 'dispute_closed'
  businessName: string
  offerName: string
  amount?: string | null
  detail?: string | null
  inboxUrl: string
}): { subject: string; html: string; text: string } {
  const { businessName, offerName, amount, detail, inboxUrl } = opts
  const copy = {
    refund: {
      subject: `Refund processed: ${offerName}`,
      heading: 'Refund processed',
      lead: `A payment on your Nexez page "${businessName}" was refunded to the buyer.`,
      color: '#0a0a0a',
    },
    dispute_opened: {
      subject: `⚠️ Payment disputed: ${offerName}`,
      heading: 'A payment is disputed',
      lead: `A buyer disputed a payment on your Nexez page "${businessName}". Disputes are time-sensitive — respond with evidence in your Stripe dashboard before the deadline, or the dispute is auto-lost.`,
      color: '#b91c1c',
    },
    dispute_closed: {
      subject: `Dispute resolved: ${offerName}`,
      heading: 'Dispute resolved',
      lead: `A dispute on your Nexez page "${businessName}" has closed.`,
      color: '#0a0a0a',
    },
  }[opts.kind]
  const rows: [string, string | null | undefined][] = [
    ['Offer', offerName],
    ['Amount', amount],
    ['Details', detail],
  ]
  const present = rows.filter(([, v]) => v)
  const text = [copy.lead, '', ...present.map(([k, v]) => `${k}: ${v}`), '', `Manage it: ${inboxUrl}`].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0a0a0a">
  <h2 style="margin:0 0 8px;color:${copy.color}">${escapeHtml(copy.heading)}</h2>
  <p style="margin:0 0 12px">${escapeHtml(copy.lead)}</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${present
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#52525b">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`,
    )
    .join('')}</table>
  <p style="margin:0"><a href="${inboxUrl}" style="display:inline-block;background:#10B981;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open your negotiation inbox</a></p>
</div>`
  return { subject: copy.subject, html, text }
}

// Pure builder (testable) for the "new negotiation request" email.
export function buildNegotiationEmail(opts: {
  businessName: string
  offerName: string
  budget?: string | null
  timeline?: string | null
  query?: string | null
  buyerAgent?: string | null
  inboxUrl: string
}): { subject: string; html: string; text: string } {
  const { businessName, offerName, budget, timeline, query, buyerAgent, inboxUrl } = opts

  const subject = `New negotiation request for ${offerName}`

  const rows: [string, string | null | undefined][] = [
    ['Offer', offerName],
    ['Budget', budget],
    ['Timeline', timeline],
    ['From agent', buyerAgent],
    ['Message', query],
  ]
  const present = rows.filter(([, v]) => v)

  const text = [
    `You have a new negotiation request on your Nexez page "${businessName}".`,
    '',
    ...present.map(([k, v]) => `${k}: ${v}`),
    '',
    `Respond in your inbox: ${inboxUrl}`,
  ].join('\n')

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0a0a0a">
  <h2 style="margin:0 0 8px">New negotiation request</h2>
  <p style="margin:0 0 12px">You have a new negotiation request on your Nexez page <strong>${escapeHtml(
    businessName,
  )}</strong>.</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${present
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#52525b">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(
          String(v),
        )}</strong></td></tr>`,
    )
    .join('')}</table>
  <p style="margin:0"><a href="${inboxUrl}" style="display:inline-block;background:#7C3AED;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open your negotiation inbox</a></p>
</div>`

  return { subject, html, text }
}
