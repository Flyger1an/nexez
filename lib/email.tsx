import 'server-only'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'
import { captureError } from './observability'
import {
  BookingEmail,
  NegotiationEmail,
  EscrowFundedEmail,
  MoneyEventEmail,
  BuyerReceiptEmail,
  BuyerStatusEmail,
  BuyerRequestEmail,
  OrderLookupEmail,
  TeamInviteEmail,
  WelcomeEmail,
  StripeConnectedEmail,
  StaleListingEmail,
  SellerGrowthInviteEmail,
  PromotionExpiryEmail,
} from '../emails/templates'

// Gated transactional email (Resend-compatible). Dormant unless RESEND_API_KEY
// is set - like the other gated integrations (LLM, Stripe, Vercel). When unset,
// sendEmail is a no-op so the rest of the flow is unaffected.
//
// HTML is rendered from the branded react-email templates in ../emails (one brand
// palette, proper <Html>/<Head>/<Preview>, Outlook-friendly tables). The builders
// are ASYNC because react-email's render() is async. Plain-text bodies stay
// hand-authored here (cleaner + lets the text remain stable + unit-tested).

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
      const error = `resend ${res.status}: ${body.slice(0, 200)}`
      captureError(new Error(`Email provider rejected a send with status ${res.status}.`), {
        area: 'email-send',
        provider: 'resend',
        status: res.status,
      })
      return { ok: false, error }
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: data?.id }
  } catch (e) {
    captureError(e, { area: 'email-send', provider: 'resend' })
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

type Built = { subject: string; html: string; text: string }
type Row = [string, string | null | undefined]

const present = (rows: Row[]) => rows.filter(([, v]) => v)
const textBody = (lead: string, rows: Row[], cta: string, url: string) =>
  [lead, '', ...present(rows).map(([k, v]) => `${k}: ${v}`), '', `${cta}: ${url}`].join('\n')

// A plain-HTML fallback built from the (always-present) text body. Used only if
// react-email render() throws.
function basicHtml(text: string): string {
  const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;white-space:pre-wrap;line-height:1.6;color:#0a0a0a;max-width:560px;margin:0 auto;padding:24px">${esc}</div>`
}

// Render a template to HTML, but NEVER let a render failure silently kill the email.
// react-email's render() can throw at runtime (e.g. a serverless output-tracing gap that
// drops a transitive dep - passes locally + in the build, fails live). On failure we log
// + report it and fall back to the plain-text body as HTML, so the email still sends.
async function renderHtml(element: ReactElement, text: string): Promise<string> {
  try {
    return await render(element)
  } catch (e) {
    const template = (element.type as { name?: string })?.name || 'email'
    console.error(`[email] render failed for "${template}" - sending plain-HTML fallback:`, e)
    captureError(e, { area: 'email-render', template })
    return basicHtml(text)
  }
}

// ── Seller: new booking (Calendly etc.) ─────────────────────────────────────────
export async function buildBookingEmail(opts: {
  businessName: string
  eventName: string
  inviteeName?: string | null
  inviteeEmail?: string | null
  startTime?: string | null
  source?: string | null
  inboxUrl: string
}): Promise<Built> {
  const { businessName, eventName, inviteeName, inviteeEmail, startTime, source, inboxUrl } = opts
  const subject = `New booking: ${eventName}`
  const when = startTime ? new Date(startTime).toLocaleString() : null
  const rows: Row[] = [
    ['Booking', eventName],
    ['Guest', inviteeName],
    ['Email', inviteeEmail],
    ['When', when],
    ['Source', source],
  ]
  const text = textBody(`You have a new booking on your Nexez listing "${businessName}".`, rows, 'Manage it', inboxUrl)
  const html = await renderHtml(<BookingEmail businessName={businessName} rows={rows} inboxUrl={inboxUrl} />, text)
  return { subject, html, text }
}

// ── Seller: buyer funded escrow ─────────────────────────────────────────────────
export async function buildEscrowFundedEmail(opts: {
  businessName: string
  offerName: string
  amount: string
  held: boolean
  buyerAgent?: string | null
  inboxUrl: string
}): Promise<Built> {
  const { businessName, offerName, amount, held, buyerAgent, inboxUrl } = opts
  const subject = held ? `Payment held in escrow: ${offerName}` : `Payment received: ${offerName}`
  const lead = held
    ? `A buyer funded an escrow hold on your Nexez listing "${businessName}". Capture it from your inbox once you've delivered.`
    : `A buyer paid for an agreement on your Nexez listing "${businessName}".`
  const rows: Row[] = [
    ['Offer', offerName],
    ['Amount', amount],
    ['Status', held ? 'Held in escrow (awaiting your capture)' : 'Captured'],
    ['From agent', buyerAgent],
  ]
  const text = textBody(lead, rows, 'Manage it', inboxUrl)
  const html = await renderHtml(<EscrowFundedEmail lead={lead} held={held} rows={rows} inboxUrl={inboxUrl} />, text)
  return { subject, html, text }
}

// ── Seller: refund / dispute money events ───────────────────────────────────────
export async function buildMoneyEventEmail(opts: {
  kind: 'refund' | 'dispute_opened' | 'dispute_closed'
  businessName: string
  offerName: string
  amount?: string | null
  detail?: string | null
  inboxUrl: string
}): Promise<Built> {
  const { businessName, offerName, amount, detail, inboxUrl } = opts
  const copy = {
    refund: {
      subject: `Refund processed: ${offerName}`,
      heading: 'Refund processed',
      lead: `A payment on your Nexez listing "${businessName}" was refunded to the buyer.`,
      tone: 'neutral' as const,
    },
    dispute_opened: {
      subject: `⚠️ Payment disputed: ${offerName}`,
      heading: 'A payment is disputed',
      lead: `A buyer disputed a payment on your Nexez listing "${businessName}". Disputes are time-sensitive - respond with evidence in your Stripe dashboard before the deadline, or the dispute is auto-lost.`,
      tone: 'danger' as const,
    },
    dispute_closed: {
      subject: `Dispute resolved: ${offerName}`,
      heading: 'Dispute resolved',
      lead: `A dispute on your Nexez listing "${businessName}" has closed.`,
      tone: 'neutral' as const,
    },
  }[opts.kind]
  const rows: Row[] = [
    ['Offer', offerName],
    ['Amount', amount],
    ['Details', detail],
  ]
  const text = textBody(copy.lead, rows, 'Manage it', inboxUrl)
  const html = await renderHtml(
    <MoneyEventEmail heading={copy.heading} tone={copy.tone} lead={copy.lead} rows={rows} inboxUrl={inboxUrl} />,
    text,
  )
  return { subject: copy.subject, html, text }
}

// ── Seller: new negotiation request ─────────────────────────────────────────────
export async function buildNegotiationEmail(opts: {
  businessName: string
  offerName: string
  budget?: string | null
  timeline?: string | null
  query?: string | null
  buyerAgent?: string | null
  inboxUrl: string
}): Promise<Built> {
  const { businessName, offerName, budget, timeline, query, buyerAgent, inboxUrl } = opts
  const subject = `New negotiation request for ${offerName}`
  const rows: Row[] = [
    ['Offer', offerName],
    ['Budget', budget],
    ['Timeline', timeline],
    ['From agent', buyerAgent],
    ['Message', query],
  ]
  const text = textBody(
    `You have a new negotiation request on your Nexez listing "${businessName}".`,
    rows,
    'Respond in your inbox',
    inboxUrl,
  )
  const html = await renderHtml(<NegotiationEmail businessName={businessName} rows={rows} inboxUrl={inboxUrl} />, text)
  return { subject, html, text }
}

// ── Buyer: purchase receipt ─────────────────────────────────────────────────────
export async function buildBuyerReceiptEmail(opts: {
  businessName: string
  offerName: string
  amount: string
  manageUrl: string
}): Promise<Built> {
  const { businessName, offerName, amount, manageUrl } = opts
  const subject = `Your receipt from ${businessName}`
  const lead = `Thanks for your purchase from ${businessName}. Here's your receipt - keep this link to track your order or get help.`
  const rows: Row[] = [
    ['Seller', businessName],
    ['Item', offerName],
    ['Amount', amount],
  ]
  const text = textBody(lead, rows, 'Manage your order', manageUrl)
  const html = await renderHtml(<BuyerReceiptEmail lead={lead} rows={rows} manageUrl={manageUrl} />, text)
  return { subject, html, text }
}

// ── Buyer: order status update ──────────────────────────────────────────────────
export async function buildBuyerStatusEmail(opts: {
  kind: 'refunded' | 'partial_refund' | 'dispute_update' | 'request_received'
  businessName: string
  offerName: string
  amount?: string | null
  detail?: string | null
  manageUrl: string
}): Promise<Built> {
  const { businessName, offerName, amount, detail, manageUrl } = opts
  const copy = {
    refunded: {
      subject: `Your refund from ${businessName} is on its way`,
      heading: 'Refund processed',
      lead: `Your payment to ${businessName} was refunded in full. Depending on your bank, it can take a few business days to appear.`,
      cta: 'View your order',
    },
    partial_refund: {
      subject: `A partial refund from ${businessName}`,
      heading: 'Partial refund processed',
      lead: `Part of your payment to ${businessName} was refunded. Depending on your bank, it can take a few business days to appear.`,
      cta: 'View your order',
    },
    dispute_update: {
      subject: `Update on your order from ${businessName}`,
      heading: 'Dispute update',
      lead: `There's an update on the dispute for your order from ${businessName}.`,
      cta: 'View your order',
    },
    request_received: {
      subject: `We received your request - ${businessName}`,
      heading: 'Request received',
      lead: `Thanks - we've passed your request to ${businessName}. You'll get an update here as soon as the seller responds.`,
      cta: 'Track your request',
    },
  }[opts.kind]
  const rows: Row[] = [
    ['Seller', businessName],
    ['Item', offerName],
    ['Amount', amount],
    ['Details', detail],
  ]
  const text = textBody(copy.lead, rows, 'View your order', manageUrl)
  const html = await renderHtml(
    <BuyerStatusEmail heading={copy.heading} lead={copy.lead} cta={copy.cta} rows={rows} manageUrl={manageUrl} />,
    text,
  )
  return { subject: copy.subject, html, text }
}

// ── Seller: buyer filed a refund request / problem report ───────────────────────
export async function buildBuyerRequestEmail(opts: {
  kind: 'refund_request' | 'problem_report'
  businessName: string
  offerName: string
  amount?: string | null
  message?: string | null
  buyerEmail?: string | null
  inboxUrl: string
}): Promise<Built> {
  const { kind, businessName, offerName, amount, message, buyerEmail, inboxUrl } = opts
  const isRefund = kind === 'refund_request'
  const subject = isRefund ? `Refund requested: ${offerName}` : `Buyer reported a problem: ${offerName}`
  const heading = isRefund ? 'A buyer requested a refund' : 'A buyer reported a problem'
  const lead = isRefund
    ? `A buyer on your Nexez listing "${businessName}" requested a refund. Review it and refund from your Finance dashboard if appropriate.`
    : `A buyer on your Nexez listing "${businessName}" reported a problem with their order. Reach out and resolve it from your Finance dashboard.`
  const rows: Row[] = [
    ['Offer', offerName],
    ['Amount', amount],
    ['Buyer', buyerEmail],
    ['Message', message],
  ]
  const text = textBody(lead, rows, 'Review it', inboxUrl)
  const html = await renderHtml(
    <BuyerRequestEmail heading={heading} tone={isRefund ? 'caution' : 'neutral'} lead={lead} rows={rows} inboxUrl={inboxUrl} />,
    text,
  )
  return { subject, html, text }
}

// ── Buyer: "find my orders" magic link ──────────────────────────────────────────
export async function buildOrderLookupEmail(opts: { count: number; findUrl: string }): Promise<Built> {
  const { count, findUrl } = opts
  const subject = 'Your Nexez orders'
  const lead =
    count === 1
      ? 'Here is the order linked to this email. Use the secure link below to view it, track its status, or get help. The link expires in 24 hours.'
      : `Here are the ${count} orders linked to this email. Use the secure link below to view them, track status, or get help. The link expires in 24 hours.`
  const text = [lead, '', `View your orders: ${findUrl}`, '', "If you didn't request this, you can ignore this email."].join('\n')
  const html = await renderHtml(<OrderLookupEmail lead={lead} count={count} findUrl={findUrl} />, text)
  return { subject, html, text }
}

// ── Teammate: collaboration invite ──────────────────────────────────────────────
export async function buildTeamInviteEmail(opts: {
  inviterEmail: string
  inviteeEmail: string
  role: string
  acceptUrl: string
}): Promise<Built> {
  const { inviterEmail, inviteeEmail, role, acceptUrl } = opts
  const roleCopy = role === 'editor' ? 'edit their listings' : 'view their listings (read-only)'
  const subject = `${inviterEmail} invited you to collaborate on Nexez`
  const lead = `${inviterEmail} invited you to their Nexez workspace as a ${role}. You'll be able to ${roleCopy}.`
  const text = [
    lead,
    '',
    `Important: sign in or create your account using THIS email address (${inviteeEmail}) - that's how your access is granted.`,
    '',
    `Accept the invite: ${acceptUrl}`,
  ].join('\n')
  const html = await renderHtml(<TeamInviteEmail lead={lead} inviteeEmail={inviteeEmail} acceptUrl={acceptUrl} />, text)
  return { subject, html, text }
}

// ── Seller growth: invite another business to complimentary Launch access ──────
export async function buildSellerGrowthInviteEmail(opts: {
  inviterBusinessName: string
  inviteeEmail: string
  durationDays: number
  claimUrl: string
}): Promise<Built> {
  const { inviterBusinessName, inviteeEmail, durationDays, claimUrl } = opts
  const durationLabel = durationDays === 180 ? 'six months' : `${durationDays} days`
  const subject = `${inviterBusinessName} sent your business complimentary Nexez Launch access`
  const text = [
    `${inviterBusinessName} invited your business to use Nexez Launch for ${durationLabel} at no subscription cost.`,
    '',
    'Publish an agent-ready listing and verify your business to activate the pass. No card is required.',
    '',
    `Claim it using this exact email address (${inviteeEmail}): ${claimUrl}`,
    '',
    "This invitation creates a separate business account. It does not grant access to the sender's workspace.",
    'When complimentary access ends, the account returns to Free unless you choose a paid plan.',
  ].join('\n')
  const html = await renderHtml(
    <SellerGrowthInviteEmail
      inviterBusinessName={inviterBusinessName}
      inviteeEmail={inviteeEmail}
      durationLabel={durationLabel}
      claimUrl={claimUrl}
    />,
    text,
  )
  return { subject, html, text }
}

// ── Seller growth: reminder before a promotional plan returns to Free ───────────
export async function buildPromotionExpiryEmail(opts: {
  businessName: string
  daysBefore: number
  endsAt: string
  fallbackListingName?: string | null
  billingUrl: string
}): Promise<Built> {
  const { businessName, daysBefore, endsAt, fallbackListingName = null, billingUrl } = opts
  const timing = daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`
  const endsOn = new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(endsAt))
  const subject = `Your complimentary Nexez Launch access ends ${timing}`
  const text = [
    `${businessName} will return to the Free plan on ${endsOn}.`,
    '',
    'There is no automatic charge and your business stays on Nexez.',
    `Listing kept published: ${fallbackListingName || 'your oldest published listing'}`,
    'Drafts and extra listings are preserved.',
    '',
    `Review plans and your fallback listing: ${billingUrl}`,
  ].join('\n')
  const html = await renderHtml(
    <PromotionExpiryEmail
      businessName={businessName}
      daysBefore={daysBefore}
      endsOn={endsOn}
      fallbackListingName={fallbackListingName}
      billingUrl={billingUrl}
    />,
    text,
  )
  return { subject, html, text }
}

// ── New-user welcome (fired once on first sign-in via sendOnceSystemEmail) ───────
export async function buildWelcomeEmail(opts: { name?: string | null; createUrl: string }): Promise<Built> {
  const { name, createUrl } = opts
  const subject = 'Welcome to Nexez'
  const greeting = name ? `Welcome to Nexez, ${name}.` : 'Welcome to Nexez.'
  const text = [
    greeting,
    '',
    'Publish a listing AI agents can read - then let them book and pay through, straight to your own Stripe. You only pay a fee when you get paid.',
    '',
    `Create your first agent listing: ${createUrl}`,
  ].join('\n')
  const html = await renderHtml(<WelcomeEmail name={name} createUrl={createUrl} />, text)
  return { subject, html, text }
}

// ── Stripe Connect linked + charges enabled (fired once on the false→true flip) ──
export async function buildStripeConnectedEmail(opts: { financeUrl: string }): Promise<Built> {
  const { financeUrl } = opts
  const subject = 'Stripe is connected - you can accept agent payments'
  const text = [
    'Your Stripe account is linked and charges are enabled. You can now accept card payments from AI agents - payouts go straight to your Stripe, and Nexez only takes its fee when you get paid.',
    '',
    `Open your Finance dashboard: ${financeUrl}`,
  ].join('\n')
  const html = await renderHtml(<StripeConnectedEmail financeUrl={financeUrl} />, text)
  return { subject, html, text }
}

// ── Stale-listing re-interview nudge (freshness cron; seller-facet email) ──
export async function buildStaleListingEmail(opts: {
  businessName: string
  listingName: string
  freshnessLabel: string
  reinterviewUrl: string
  editUrl: string
}): Promise<Built> {
  const { businessName, listingName, freshnessLabel, reinterviewUrl, editUrl } = opts
  const subject = `Keep “${listingName}” accurate for AI agents`
  const text = [
    `Your Nexez listing "${listingName}" hasn't changed in a while (${freshnessLabel}), so AI agents may be quoting stale prices or offers.`,
    '',
    'A short re-interview asks only about what is missing or could be stronger - most people finish in a couple of minutes.',
    '',
    `Re-interview this listing: ${reinterviewUrl}`,
    `Or edit it by hand: ${editUrl}`,
  ].join('\n')
  const html = await renderHtml(
    <StaleListingEmail
      businessName={businessName}
      listingName={listingName}
      freshnessLabel={freshnessLabel}
      reinterviewUrl={reinterviewUrl}
      editUrl={editUrl}
    />,
    text,
  )
  return { subject, html, text }
}
