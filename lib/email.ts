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

// Shared chrome for BUYER-facing emails (receipt + status updates). Distinct from
// the seller notifications above — these go to the buyer's captured email and link
// to their order portal, never to the dashboard.
function buyerEmailHtml(opts: {
  heading: string
  headingColor?: string
  lead: string
  rows: [string, string | null | undefined][]
  ctaLabel: string
  manageUrl: string
}): string {
  const present = opts.rows.filter(([, v]) => v)
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0a0a0a">
  <h2 style="margin:0 0 8px;color:${opts.headingColor || '#0a0a0a'}">${escapeHtml(opts.heading)}</h2>
  <p style="margin:0 0 12px">${escapeHtml(opts.lead)}</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${present
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#52525b">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`,
    )
    .join('')}</table>
  <p style="margin:0"><a href="${opts.manageUrl}" style="display:inline-block;background:#5566F2;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(opts.ctaLabel)}</a></p>
  <p style="margin:14px 0 0;font-size:12px;color:#71717a">You can view this order, track its status, request a refund, or report a problem at any time using the link above.</p>
</div>`
}

// Pure builder (testable) for the BUYER's purchase receipt — sent after a direct
// checkout completes, with a link to their order portal. `amount` is pre-formatted.
export function buildBuyerReceiptEmail(opts: {
  businessName: string
  offerName: string
  amount: string
  manageUrl: string
}): { subject: string; html: string; text: string } {
  const { businessName, offerName, amount, manageUrl } = opts
  const subject = `Your receipt from ${businessName}`
  const lead = `Thanks for your purchase from ${businessName}. Here's your receipt — keep this link to track your order or get help.`
  const rows: [string, string | null | undefined][] = [
    ['Seller', businessName],
    ['Item', offerName],
    ['Amount', amount],
  ]
  const text = [
    lead,
    '',
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    '',
    `Manage your order: ${manageUrl}`,
  ].join('\n')
  return { subject, html: buyerEmailHtml({ heading: 'Order confirmed', lead, rows, ctaLabel: 'View your order', manageUrl }), text }
}

// Pure builder (testable) for BUYER status updates — refund processed, dispute
// update, or "we received your request" — fired when the order's state changes.
export function buildBuyerStatusEmail(opts: {
  kind: 'refunded' | 'partial_refund' | 'dispute_update' | 'request_received'
  businessName: string
  offerName: string
  amount?: string | null
  detail?: string | null
  manageUrl: string
}): { subject: string; html: string; text: string } {
  const { businessName, offerName, amount, detail, manageUrl } = opts
  const copy = {
    refunded: {
      subject: `Your refund from ${businessName} is on its way`,
      heading: 'Refund processed',
      color: '#0a0a0a',
      lead: `Your payment to ${businessName} was refunded in full. Depending on your bank, it can take a few business days to appear.`,
      cta: 'View your order',
    },
    partial_refund: {
      subject: `A partial refund from ${businessName}`,
      heading: 'Partial refund processed',
      color: '#0a0a0a',
      lead: `Part of your payment to ${businessName} was refunded. Depending on your bank, it can take a few business days to appear.`,
      cta: 'View your order',
    },
    dispute_update: {
      subject: `Update on your order from ${businessName}`,
      heading: 'Dispute update',
      color: '#0a0a0a',
      lead: `There's an update on the dispute for your order from ${businessName}.`,
      cta: 'View your order',
    },
    request_received: {
      subject: `We received your request — ${businessName}`,
      heading: 'Request received',
      color: '#0a0a0a',
      lead: `Thanks — we've passed your request to ${businessName}. You'll get an update here as soon as the seller responds.`,
      cta: 'Track your request',
    },
  }[opts.kind]
  const rows: [string, string | null | undefined][] = [
    ['Seller', businessName],
    ['Item', offerName],
    ['Amount', amount],
    ['Details', detail],
  ]
  const text = [copy.lead, '', ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), '', `View your order: ${manageUrl}`].join('\n')
  return {
    subject: copy.subject,
    html: buyerEmailHtml({ heading: copy.heading, headingColor: copy.color, lead: copy.lead, rows, ctaLabel: copy.cta, manageUrl }),
    text,
  }
}

// Pure builder (testable) for the SELLER notification when a buyer files a refund
// request or problem report from the portal. Drives the seller to Finance, where
// they can refund / respond. `amount` is pre-formatted.
export function buildBuyerRequestEmail(opts: {
  kind: 'refund_request' | 'problem_report'
  businessName: string
  offerName: string
  amount?: string | null
  message?: string | null
  buyerEmail?: string | null
  inboxUrl: string
}): { subject: string; html: string; text: string } {
  const { kind, businessName, offerName, amount, message, buyerEmail, inboxUrl } = opts
  const isRefund = kind === 'refund_request'
  const subject = isRefund ? `Refund requested: ${offerName}` : `Buyer reported a problem: ${offerName}`
  const heading = isRefund ? 'A buyer requested a refund' : 'A buyer reported a problem'
  const lead = isRefund
    ? `A buyer on your Nexez page "${businessName}" requested a refund. Review it and refund from your Finance dashboard if appropriate.`
    : `A buyer on your Nexez page "${businessName}" reported a problem with their order. Reach out and resolve it from your Finance dashboard.`
  const rows: [string, string | null | undefined][] = [
    ['Offer', offerName],
    ['Amount', amount],
    ['Buyer', buyerEmail],
    ['Message', message],
  ]
  const present = rows.filter(([, v]) => v)
  const text = [lead, '', ...present.map(([k, v]) => `${k}: ${v}`), '', `Review it: ${inboxUrl}`].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0a0a0a">
  <h2 style="margin:0 0 8px;color:${isRefund ? '#b45309' : '#0a0a0a'}">${escapeHtml(heading)}</h2>
  <p style="margin:0 0 12px">${escapeHtml(lead)}</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${present
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#52525b">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`,
    )
    .join('')}</table>
  <p style="margin:0"><a href="${inboxUrl}" style="display:inline-block;background:#10B981;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open your Finance dashboard</a></p>
</div>`
  return { subject, html, text }
}

// Pure builder (testable) for the "find my orders" magic-link email — sent ONLY when a
// lookup matched real orders for the address. Carries one signed, expiring link to the
// buyer's order list (per-order tokens live on that page, never in this email).
export function buildOrderLookupEmail(opts: {
  count: number
  findUrl: string
}): { subject: string; html: string; text: string } {
  const { count, findUrl } = opts
  const subject = 'Your Nexez orders'
  const lead =
    count === 1
      ? 'Here is the order linked to this email. Use the secure link below to view it, track its status, or get help. The link expires in 24 hours.'
      : `Here are the ${count} orders linked to this email. Use the secure link below to view them, track status, or get help. The link expires in 24 hours.`
  const text = [lead, '', `View your orders: ${findUrl}`, '', "If you didn't request this, you can ignore this email."].join('\n')
  return {
    subject,
    html: buyerEmailHtml({
      heading: 'Your orders',
      lead,
      rows: [['Orders', String(count)]],
      ctaLabel: 'View your orders',
      manageUrl: findUrl,
    }),
    text,
  }
}
