import * as React from 'react'
import { BrandedEmail, EmailHeading, Lead, InfoRows, PrimaryButton, FinePrint } from './BrandedEmail'
import { styles, BRAND } from './theme'
import { Text } from '@react-email/components'

// Presentational templates — one per live email. Props are already formatted by the
// builders in lib/email.tsx (dates, currency, subjects live there); these stay pure.
// Copy/voice is ported verbatim from the previous string builders.

// ── Seller: new booking (Calendly etc.) ────────────────────────────────────────
export function BookingEmail(p: {
  businessName: string
  rows: Array<[string, string | null | undefined]>
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={`New booking on ${p.businessName}`}>
      <EmailHeading>New booking</EmailHeading>
      <Lead>
        A new booking came in on your Nexez listing <strong>{p.businessName}</strong>.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open your dashboard</PrimaryButton>
    </BrandedEmail>
  )
}

// ── Seller: new negotiation request ─────────────────────────────────────────────
export function NegotiationEmail(p: {
  businessName: string
  rows: Array<[string, string | null | undefined]>
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={`New negotiation request on ${p.businessName}`}>
      <EmailHeading>New negotiation request</EmailHeading>
      <Lead>
        You have a new negotiation request on your Nexez listing <strong>{p.businessName}</strong>.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open your negotiation inbox</PrimaryButton>
    </BrandedEmail>
  )
}

// ── Seller: buyer funded escrow (held = awaiting capture; else captured) ─────────
export function EscrowFundedEmail(p: {
  lead: string
  held: boolean
  rows: Array<[string, string | null | undefined]>
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead}>
      <EmailHeading tone={p.held ? 'neutral' : 'positive'}>
        {p.held ? 'Payment held in escrow' : 'Payment received'}
      </EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open your negotiation inbox</PrimaryButton>
    </BrandedEmail>
  )
}

// ── Seller: refund / dispute money events ───────────────────────────────────────
export function MoneyEventEmail(p: {
  heading: string
  tone: 'neutral' | 'danger'
  lead: string
  rows: Array<[string, string | null | undefined]>
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead}>
      <EmailHeading tone={p.tone}>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open your negotiation inbox</PrimaryButton>
    </BrandedEmail>
  )
}

// ── Buyer: shared fine print for portal-linked emails ───────────────────────────
const BUYER_NOTE = 'You can view this order, track its status, request a refund, or report a problem at any time using the link above.'

// ── Buyer: purchase receipt ─────────────────────────────────────────────────────
export function BuyerReceiptEmail(p: {
  lead: string
  rows: Array<[string, string | null | undefined]>
  manageUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead}>
      <EmailHeading tone="positive">Order confirmed</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.manageUrl}>View your order</PrimaryButton>
      <FinePrint>{BUYER_NOTE}</FinePrint>
    </BrandedEmail>
  )
}

// ── Buyer: order status update ──────────────────────────────────────────────────
export function BuyerStatusEmail(p: {
  heading: string
  lead: string
  cta: string
  rows: Array<[string, string | null | undefined]>
  manageUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead}>
      <EmailHeading>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.manageUrl}>{p.cta}</PrimaryButton>
      <FinePrint>{BUYER_NOTE}</FinePrint>
    </BrandedEmail>
  )
}

// ── Seller: buyer filed a refund request / problem report ───────────────────────
export function BuyerRequestEmail(p: {
  heading: string
  tone: 'caution' | 'neutral'
  lead: string
  rows: Array<[string, string | null | undefined]>
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead}>
      <EmailHeading tone={p.tone}>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open your Finance dashboard</PrimaryButton>
    </BrandedEmail>
  )
}

// ── Buyer: "find my orders" magic link ──────────────────────────────────────────
export function OrderLookupEmail(p: { lead: string; count: number; findUrl: string }) {
  return (
    <BrandedEmail preview="Your Nexez orders">
      <EmailHeading>Your orders</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={[['Orders', String(p.count)]]} />
      <PrimaryButton href={p.findUrl}>View your orders</PrimaryButton>
      <FinePrint>If you didn&apos;t request this, you can ignore this email.</FinePrint>
    </BrandedEmail>
  )
}

// ── Teammate: collaboration invite ──────────────────────────────────────────────
export function TeamInviteEmail(p: { lead: string; inviteeEmail: string; acceptUrl: string }) {
  return (
    <BrandedEmail preview={p.lead}>
      <EmailHeading>You&apos;re invited to collaborate</EmailHeading>
      <Lead>{p.lead}</Lead>
      <Text style={{ ...styles.lead, fontSize: '13px', color: BRAND.fgMuted }}>
        Sign in or create your account using <strong>{p.inviteeEmail}</strong> — that exact address is how your access is granted.
      </Text>
      <PrimaryButton href={p.acceptUrl}>Accept invite</PrimaryButton>
      <FinePrint>If you weren&apos;t expecting this, you can ignore this email.</FinePrint>
    </BrandedEmail>
  )
}

// ── New-user welcome (branded; ready to wire to a send-once signup trigger) ──────
export function WelcomeEmail(p: { name?: string | null; createUrl: string }) {
  const greeting = p.name ? `Welcome to Nexez, ${p.name}.` : 'Welcome to Nexez.'
  return (
    <BrandedEmail preview="Welcome to Nexez — publish a listing agents can buy from.">
      <EmailHeading tone="positive">{greeting}</EmailHeading>
      <Lead>
        Publish a listing AI agents can read — then let them book and pay through, straight to your own Stripe. You only pay a
        fee when you get paid.
      </Lead>
      <PrimaryButton href={p.createUrl}>Create your first agent listing</PrimaryButton>
      <FinePrint>Need a hand getting started? Just reply to this email.</FinePrint>
    </BrandedEmail>
  )
}

// ── Stripe Connect linked (branded; ready to wire to a send-once connect trigger) ─
export function StripeConnectedEmail(p: { financeUrl: string }) {
  return (
    <BrandedEmail preview="Stripe is connected — you can accept agent payments now.">
      <EmailHeading tone="positive">Stripe is connected</EmailHeading>
      <Lead>
        Your Stripe account is linked and charges are enabled. You can now accept card payments from AI agents — payouts go
        straight to your Stripe, and Nexez only takes its fee when you get paid.
      </Lead>
      <PrimaryButton href={p.financeUrl}>Open your Finance dashboard</PrimaryButton>
    </BrandedEmail>
  )
}
