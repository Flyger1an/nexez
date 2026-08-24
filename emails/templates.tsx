import * as React from 'react'
import { Link, Text } from '@react-email/components'
import {
  BrandedEmail,
  EmailEyebrow,
  EmailHeading,
  FinePrint,
  InfoRows,
  Lead,
  Notice,
  PrimaryButton,
  StatusBadge,
} from './BrandedEmail'
import { BRAND, styles, type EmailTone } from './theme'

type Rows = Array<[string, string | null | undefined]>

const BUYER_NOTE = 'This link is private to your order. It lets you track verified status, request help, and review seller updates.'

export function BookingEmail(p: {
  businessName: string
  rows: Rows
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={`New booking on ${p.businessName}`} category="Merchant action">
      <EmailEyebrow>Booking received</EmailEyebrow>
      <StatusBadge tone="positive">Confirmed</StatusBadge>
      <EmailHeading>New booking</EmailHeading>
      <Lead>
        A booking was confirmed for <strong>{p.businessName}</strong>. Review the guest and schedule details below.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Review booking</PrimaryButton>
      <Notice>Nexez shows only the details confirmed by the connected booking source.</Notice>
    </BrandedEmail>
  )
}

export function NegotiationEmail(p: {
  businessName: string
  rows: Rows
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={`New negotiation request on ${p.businessName}`} category="Merchant action">
      <EmailEyebrow>Buyer inquiry</EmailEyebrow>
      <StatusBadge tone="caution">Response needed</StatusBadge>
      <EmailHeading>New negotiation request</EmailHeading>
      <Lead>
        A buyer wants to discuss an offer from <strong>{p.businessName}</strong>. Review the request before accepting or changing any terms.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open negotiation</PrimaryButton>
      <Notice>Budget and timing remain proposed until both sides agree.</Notice>
    </BrandedEmail>
  )
}

export function EscrowFundedEmail(p: {
  lead: string
  held: boolean
  rows: Rows
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Merchant action">
      <EmailEyebrow>Payment state</EmailEyebrow>
      <StatusBadge tone={p.held ? 'caution' : 'positive'}>
        {p.held ? 'Held for capture' : 'Payment received'}
      </StatusBadge>
      <EmailHeading>{p.held ? 'Funds are secured' : 'Payment received'}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Review payment</PrimaryButton>
      <Notice>
        {p.held
          ? 'Held funds are not settled revenue. Capture only when the agreement allows it.'
          : 'This payment state comes from Stripe-confirmed evidence.'}
      </Notice>
    </BrandedEmail>
  )
}

export function MoneyEventEmail(p: {
  heading: string
  statusLabel: string
  tone: EmailTone
  lead: string
  rows: Rows
  inboxUrl: string
  cta: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Merchant action">
      <EmailEyebrow>Money state</EmailEyebrow>
      <StatusBadge tone={p.tone}>{p.statusLabel}</StatusBadge>
      <EmailHeading>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>{p.cta}</PrimaryButton>
      <Notice>Amounts and outcomes reflect the latest recorded payment-provider evidence.</Notice>
    </BrandedEmail>
  )
}

export function BuyerReceiptEmail(p: {
  lead: string
  rows: Rows
  manageUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Buyer order">
      <EmailEyebrow>Purchase receipt</EmailEyebrow>
      <StatusBadge tone="positive">Payment confirmed</StatusBadge>
      <EmailHeading>Your order is confirmed</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.manageUrl}>View your order</PrimaryButton>
      <Notice>Payment confirmation does not claim that the seller has completed fulfillment.</Notice>
      <FinePrint>{BUYER_NOTE}</FinePrint>
    </BrandedEmail>
  )
}

export function BuyerStatusEmail(p: {
  heading: string
  statusLabel: string
  tone: EmailTone
  lead: string
  cta: string
  rows: Rows
  manageUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Buyer order">
      <EmailEyebrow>Order update</EmailEyebrow>
      <StatusBadge tone={p.tone}>{p.statusLabel}</StatusBadge>
      <EmailHeading>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.manageUrl}>{p.cta}</PrimaryButton>
      <FinePrint>{BUYER_NOTE}</FinePrint>
    </BrandedEmail>
  )
}

export function BuyerRequestEmail(p: {
  heading: string
  statusLabel: string
  tone: EmailTone
  lead: string
  rows: Rows
  inboxUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Merchant action">
      <EmailEyebrow>Buyer recourse</EmailEyebrow>
      <StatusBadge tone={p.tone}>{p.statusLabel}</StatusBadge>
      <EmailHeading>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open order operations</PrimaryButton>
      <Notice>Review the request separately from payment state. A request alone does not move money.</Notice>
    </BrandedEmail>
  )
}

export function SupportTicketEmail(p: {
  requesterEmail: string
  subject: string
  rows: Rows
  adminUrl: string
}) {
  return (
    <BrandedEmail preview={`New support request: ${p.subject}`} category="Support operations">
      <EmailEyebrow>Support inbox</EmailEyebrow>
      <StatusBadge tone="caution">Response needed</StatusBadge>
      <EmailHeading>New support request</EmailHeading>
      <Lead>
        <strong>{p.requesterEmail}</strong> submitted a support request. Review the details and assign the next response from the admin desk.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.adminUrl}>Open support request</PrimaryButton>
      <Notice>Replying to this message sends your response directly to the requester.</Notice>
    </BrandedEmail>
  )
}

export function OrderLookupEmail(p: { lead: string; count: number; findUrl: string }) {
  return (
    <BrandedEmail preview="Your secure Nexez order link" category="Buyer order">
      <EmailEyebrow>Secure order access</EmailEyebrow>
      <StatusBadge>Private link</StatusBadge>
      <EmailHeading>{p.count === 1 ? 'Your order is ready to view' : 'Your orders are ready to view'}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={[[p.count === 1 ? 'Order found' : 'Orders found', String(p.count)]]} />
      <PrimaryButton href={p.findUrl}>View your orders</PrimaryButton>
      <FinePrint>If you did not request this link, you can safely ignore this email.</FinePrint>
    </BrandedEmail>
  )
}

export function TeamInviteEmail(p: { lead: string; inviteeEmail: string; acceptUrl: string }) {
  return (
    <BrandedEmail preview={p.lead} category="Account update">
      <EmailEyebrow>Workspace invitation</EmailEyebrow>
      <StatusBadge tone="positive">Invitation ready</StatusBadge>
      <EmailHeading>You are invited to collaborate</EmailHeading>
      <Lead>{p.lead}</Lead>
      <Text style={{ ...styles.lead, fontSize: '13px', color: BRAND.muted }}>
        Use <strong>{p.inviteeEmail}</strong> when you sign in. Access is bound to that exact address.
      </Text>
      <PrimaryButton href={p.acceptUrl}>Accept invitation</PrimaryButton>
      <FinePrint>If you were not expecting this invitation, you can safely ignore it.</FinePrint>
    </BrandedEmail>
  )
}

export function SellerGrowthInviteEmail(p: {
  inviterBusinessName: string
  inviteeEmail: string
  durationLabel: string
  claimUrl: string
}) {
  return (
    <BrandedEmail
      preview={`${p.inviterBusinessName} sent your business complimentary Nexez Launch access.`}
      category="Account update"
    >
      <EmailEyebrow>Complimentary access</EmailEyebrow>
      <StatusBadge tone="positive">No card required</StatusBadge>
      <EmailHeading>Your business has Launch access</EmailHeading>
      <Lead>
        <strong>{p.inviterBusinessName}</strong> invited your business to use Nexez Launch for {p.durationLabel} at no subscription cost.
      </Lead>
      <InfoRows rows={[
        ['Access', `Nexez Launch for ${p.durationLabel}`],
        ['Claim with', p.inviteeEmail],
        ['Automatic charge', 'None'],
      ]} />
      <PrimaryButton href={p.claimUrl}>Claim your Launch pass</PrimaryButton>
      <Notice>This creates a separate business account and does not grant access to the sender&apos;s workspace.</Notice>
      <FinePrint>When complimentary access ends, the account returns to Free unless you choose a paid plan.</FinePrint>
    </BrandedEmail>
  )
}

export function PromotionExpiryEmail(p: {
  businessName: string
  daysBefore: number
  endsOn: string
  fallbackListingName: string | null
  billingUrl: string
}) {
  const timing = p.daysBefore === 1 ? 'tomorrow' : `in ${p.daysBefore} days`
  return (
    <BrandedEmail preview={`Your complimentary Nexez Launch access ends ${timing}.`} category="Account update">
      <EmailEyebrow>Plan notice</EmailEyebrow>
      <StatusBadge tone="caution">Changes {timing}</StatusBadge>
      <EmailHeading>Your Launch access is ending</EmailHeading>
      <Lead>
        <strong>{p.businessName}</strong> will return to the Free plan on {p.endsOn}. Your business remains on Nexez.
      </Lead>
      <InfoRows rows={[
        ['Plan after promotion', 'Free'],
        ['Listing kept published', p.fallbackListingName || 'Your oldest published listing'],
        ['Automatic charge', 'None'],
      ]} />
      <PrimaryButton href={p.billingUrl}>Review plan details</PrimaryButton>
      <FinePrint>Drafts and extra listings are preserved. You can publish them again whenever your plan limit increases.</FinePrint>
    </BrandedEmail>
  )
}

export function WelcomeEmail(p: { name?: string | null; createUrl: string }) {
  const greeting = p.name ? `Welcome, ${p.name}.` : 'Welcome to Nexez.'
  return (
    <BrandedEmail preview="Publish a listing AI agents can understand and act on." category="Account update">
      <EmailEyebrow>Your agent-ready business layer</EmailEyebrow>
      <StatusBadge tone="positive">Account ready</StatusBadge>
      <EmailHeading>{greeting}</EmailHeading>
      <Lead>
        Create a structured listing that AI agents can understand, recommend, and act on without replacing your existing website.
      </Lead>
      <InfoRows rows={[
        ['Start with', 'Your website or business details'],
        ['Publish when', 'Every claim is accurate'],
        ['Pay when', 'You receive a marketplace payment'],
      ]} />
      <PrimaryButton href={p.createUrl}>Create your first listing</PrimaryButton>
      <FinePrint>Need help getting started? Reply to this email and our team will help.</FinePrint>
    </BrandedEmail>
  )
}

export function StripeConnectedEmail(p: { financeUrl: string }) {
  return (
    <BrandedEmail preview="Stripe is connected and your account can accept payments." category="Account update">
      <EmailEyebrow>Payments</EmailEyebrow>
      <StatusBadge tone="positive">Charges enabled</StatusBadge>
      <EmailHeading>Stripe is connected</EmailHeading>
      <Lead>Your Stripe account is linked and charges are enabled. Eligible Nexez checkout paths can now send buyer payments directly to your account.</Lead>
      <InfoRows rows={[
        ['Merchant of record', 'Your business'],
        ['Payout destination', 'Your connected Stripe account'],
        ['Nexez fee', 'Applied only when you get paid'],
      ]} />
      <PrimaryButton href={p.financeUrl}>Open Finance</PrimaryButton>
      <Notice>Connection readiness does not claim that any buyer has paid or that a payout is due.</Notice>
    </BrandedEmail>
  )
}

export function StaleListingEmail(p: {
  businessName: string
  listingName: string
  freshnessLabel: string
  reinterviewUrl: string
  editUrl: string
}) {
  return (
    <BrandedEmail preview={`Review “${p.listingName}” to keep agent-facing details current.`} category="Merchant action">
      <EmailEyebrow>Listing health</EmailEyebrow>
      <StatusBadge tone="caution">Review suggested</StatusBadge>
      <EmailHeading>Keep this listing accurate</EmailHeading>
      <Lead>
        <strong>{p.listingName}</strong> has not changed in a while. A short review helps prevent agents from relying on stale prices, offers, or availability.
      </Lead>
      <InfoRows rows={[
        ['Business', p.businessName],
        ['Listing', p.listingName],
        ['Freshness', p.freshnessLabel],
      ]} />
      <PrimaryButton href={p.reinterviewUrl}>Review with Nexez</PrimaryButton>
      <FinePrint>
        Prefer the full editor? <Link href={p.editUrl} style={styles.footerLink}>Open the listing builder</Link>. Nexez sends these reminders sparingly.
      </FinePrint>
    </BrandedEmail>
  )
}
