import * as React from 'react'
import { Link, Text } from '@react-email/components'
import {
  BrandedEmail, Caption, Data, EmailEyebrow, EmailHeading, Findings, FinePrint,
  InfoRows, Lead, NextSteps, Notice, PrimaryButton, Quote, StatusBadge, Steps,
} from './BrandedEmail'
import { BRAND, styles, type EmailTone } from './theme'

type Rows = Array<[string, string | null | undefined]>

/*
 * Content model. Every template fills four slots and they never overlap:
 *
 *   Eyebrow  the object, from a closed vocabulary: Order, Order lookup, Booking,
 *            Negotiation, Payment, Payments, Receipt, Buyer request, Listing,
 *            Account, Workspace, Plan, Launch access, Scan, Support, and the one
 *            campaign label, Texas founding cohort.
 *
 *            Closed means new templates pick from this list or the list changes
 *            deliberately. It is what stops platform mail drifting into campaign
 *            voice: a payment receipt must never say Texas founding cohort.
 *   Badge    the state that object is now in. Omitted entirely when the object
 *            has no state to report: a badge that restates the heading, names a
 *            property of the link rather than of the thing, or repeats the CTA
 *            is louder than anything around it and says nothing.
 *   Heading  what happened, in the reader's terms, sentence case, plain verb.
 *   Lead     what it means for them. Never a restatement of the heading.
 *
 * The old set repeated itself across all three (eyebrow "Payment state", badge
 * "Payment received", heading "Payment received"), which is most of why the
 * layout read as cluttered rather than the layout being wrong.
 *
 * Notice is reserved for a caveat that changes what the reader should do.
 * Everything that was only protecting us has moved to FinePrint or gone.
 */

const BUYER_NOTE = 'This link is private to your order. Use it to track status, ask for help, and see seller updates.'

export function BookingEmail(p: { businessName: string; rows: Rows; inboxUrl: string }) {
  return (
    <BrandedEmail preview={`New booking on ${p.businessName}`} category="Merchant action">
      <EmailEyebrow>Booking</EmailEyebrow>
      <StatusBadge tone="positive">Confirmed</StatusBadge>
      <EmailHeading>You have a new booking</EmailHeading>
      <Lead>
        Someone booked with <strong>{p.businessName}</strong>. The guest and schedule are below.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Review booking</PrimaryButton>
      <FinePrint>These details come from your connected booking source, unchanged.</FinePrint>
    </BrandedEmail>
  )
}

export function NegotiationEmail(p: { businessName: string; rows: Rows; inboxUrl: string }) {
  return (
    <BrandedEmail preview={`New negotiation request on ${p.businessName}`} category="Merchant action">
      <EmailEyebrow>Negotiation</EmailEyebrow>
      <StatusBadge tone="caution">Response needed</StatusBadge>
      <EmailHeading>A buyer wants to talk terms</EmailHeading>
      <Lead>
        They are asking about an offer from <strong>{p.businessName}</strong>. Read the request
        before you accept or change anything.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open negotiation</PrimaryButton>
      <Notice>Nothing here is agreed yet. Budget and timing stay proposed until you both say yes.</Notice>
    </BrandedEmail>
  )
}

export function EscrowFundedEmail(p: { lead: string; held: boolean; rows: Rows; inboxUrl: string }) {
  return (
    <BrandedEmail preview={p.lead} category="Merchant action">
      <EmailEyebrow>Payment</EmailEyebrow>
      <StatusBadge tone={p.held ? 'caution' : 'positive'}>
        {p.held ? 'Held for capture' : 'Settled'}
      </StatusBadge>
      <EmailHeading>{p.held ? 'The money is secured' : 'The buyer has paid'}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Review payment</PrimaryButton>
      {p.held
        ? <Notice>Held funds are not yours yet. Capture only once the agreement allows it.</Notice>
        : <FinePrint>Confirmed by Stripe.</FinePrint>}
    </BrandedEmail>
  )
}

export function MoneyEventEmail(p: {
  heading: string; statusLabel: string; tone: EmailTone
  lead: string; rows: Rows; inboxUrl: string; cta: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Merchant action">
      <EmailEyebrow>Payment</EmailEyebrow>
      <StatusBadge tone={p.tone}>{p.statusLabel}</StatusBadge>
      <EmailHeading>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>{p.cta}</PrimaryButton>
      <FinePrint>Amounts reflect the latest evidence from your payment provider.</FinePrint>
    </BrandedEmail>
  )
}

export function BuyerReceiptEmail(p: { lead: string; rows: Rows; manageUrl: string }) {
  return (
    <BrandedEmail preview={p.lead} category="Buyer order">
      <EmailEyebrow>Receipt</EmailEyebrow>
      <StatusBadge tone="positive">Paid</StatusBadge>
      <EmailHeading>Your order is confirmed</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.manageUrl}>View your order</PrimaryButton>
      <Notice>This confirms your payment. The seller will confirm fulfilment separately.</Notice>
      <FinePrint>{BUYER_NOTE}</FinePrint>
    </BrandedEmail>
  )
}

export function BuyerStatusEmail(p: {
  heading: string; statusLabel: string; tone: EmailTone
  lead: string; cta: string; rows: Rows; manageUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Buyer order">
      <EmailEyebrow>Order</EmailEyebrow>
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
  heading: string; statusLabel: string; tone: EmailTone
  lead: string; rows: Rows; inboxUrl: string
}) {
  return (
    <BrandedEmail preview={p.lead} category="Merchant action">
      <EmailEyebrow>Buyer request</EmailEyebrow>
      <StatusBadge tone={p.tone}>{p.statusLabel}</StatusBadge>
      <EmailHeading>{p.heading}</EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.inboxUrl}>Open order operations</PrimaryButton>
      <Notice>Handle this separately from the payment. A request on its own does not move money.</Notice>
    </BrandedEmail>
  )
}

export function SupportTicketEmail(p: {
  requesterEmail: string; subject: string; rows: Rows; adminUrl: string
}) {
  return (
    <BrandedEmail preview={`New support request: ${p.subject}`} category="Support operations">
      <EmailEyebrow>Support</EmailEyebrow>
      <StatusBadge tone="caution">Response needed</StatusBadge>
      <EmailHeading>Someone is waiting on a reply</EmailHeading>
      <Lead>
        <strong>{p.requesterEmail}</strong> wrote in. Read it and assign the next response.
      </Lead>
      <InfoRows rows={p.rows} />
      <PrimaryButton href={p.adminUrl}>Open support request</PrimaryButton>
      <Notice>Replying to this message goes straight to them, not to the desk.</Notice>
    </BrandedEmail>
  )
}

export function SupportReplyEmail(p: { subject: string; replyBody: string; requestUrl: string }) {
  return (
    <BrandedEmail preview={`Nexez Support replied to “${p.subject}”.`} category="Support operations">
      <EmailEyebrow>Support</EmailEyebrow>
      {/* No badge: "Answered" is the heading again, one line higher and louder. */}
      <EmailHeading>We replied to your request</EmailHeading>
      <Lead>About <strong>{p.subject}</strong>.</Lead>
      <Quote attribution="Nexez Support">{p.replyBody}</Quote>
      <PrimaryButton href={p.requestUrl}>Open your request</PrimaryButton>
      <FinePrint>Reply inside the request so the whole conversation stays in one place.</FinePrint>
    </BrandedEmail>
  )
}

export function SupportRequesterReplyEmail(p: {
  requesterEmail: string; subject: string; replyBody: string; adminUrl: string
}) {
  return (
    <BrandedEmail preview={`${p.requesterEmail} replied to “${p.subject}”.`} category="Support operations">
      <EmailEyebrow>Support</EmailEyebrow>
      <StatusBadge tone="caution">Awaiting you</StatusBadge>
      <EmailHeading>They wrote back</EmailHeading>
      <Lead>
        <strong>{p.requesterEmail}</strong> added a reply to <strong>{p.subject}</strong>.
      </Lead>
      <Quote attribution={p.requesterEmail}>{p.replyBody}</Quote>
      <PrimaryButton href={p.adminUrl}>Open support request</PrimaryButton>
      <FinePrint>The reply is saved in the admin desk even if this notification is delayed.</FinePrint>
    </BrandedEmail>
  )
}

export function OrderLookupEmail(p: { lead: string; count: number; findUrl: string }) {
  return (
    <BrandedEmail preview="Your secure Nexez order link" category="Buyer order">
      <EmailEyebrow>Order lookup</EmailEyebrow>
      {/* No badge: "Private link" describes the link, not a state the order
          moved into, and the eyebrow and fine print already cover it. */}
      <EmailHeading>
        {p.count === 1 ? 'Your order is ready to view' : 'Your orders are ready to view'}
      </EmailHeading>
      <Lead>{p.lead}</Lead>
      <InfoRows rows={[[p.count === 1 ? 'Order found' : 'Orders found', String(p.count)]]} />
      <PrimaryButton href={p.findUrl}>View your orders</PrimaryButton>
      <FinePrint>If you did not ask for this link, you can ignore this email.</FinePrint>
    </BrandedEmail>
  )
}

export function TeamInviteEmail(p: { lead: string; inviteeEmail: string; acceptUrl: string }) {
  return (
    <BrandedEmail preview={p.lead} category="Account update">
      <EmailEyebrow>Workspace</EmailEyebrow>
      {/* No badge: "Ready to accept" is the button, restated above the heading. */}
      <EmailHeading>You have been invited to collaborate</EmailHeading>
      <Lead>{p.lead}</Lead>
      <Caption>
        Sign in with <Data>{p.inviteeEmail}</Data>. Access is bound to that exact address.
      </Caption>
      <PrimaryButton href={p.acceptUrl}>Accept invitation</PrimaryButton>
      <FinePrint>Not expecting this? You can ignore it.</FinePrint>
    </BrandedEmail>
  )
}

export function SellerGrowthInviteEmail(p: {
  inviterBusinessName: string; inviteeEmail: string
  durationLabel: string; claimUrl: string
}) {
  return (
    <BrandedEmail
      preview={`${p.inviterBusinessName} sent your business complimentary Nexez Launch access.`}
      category="Account update"
    >
      <EmailEyebrow>Launch access</EmailEyebrow>
      {/* No badge: "No card required" is an offer term, not a state, and it is
          already the "Automatic charge: None" row below. */}
      <EmailHeading>{p.inviterBusinessName} passed this to you</EmailHeading>
      <Lead>
        They invited your business onto Nexez Launch for {p.durationLabel}, with nothing to pay.
      </Lead>
      <InfoRows rows={[
        ['Access', `Nexez Launch for ${p.durationLabel}`],
        ['Claim with', p.inviteeEmail],
        ['Automatic charge', 'None'],
      ]} />
      <PrimaryButton href={p.claimUrl}>Claim your Launch pass</PrimaryButton>
      <Notice>This creates your own separate account. It gives you no access to their workspace.</Notice>
      <FinePrint>When the complimentary period ends you move to Free, unless you pick a paid plan.</FinePrint>
    </BrandedEmail>
  )
}

/**
 * Founding cohort invitation. Cold outbound, so it carries an unsubscribe and
 * leads with the recipient's own site rather than with us.
 *
 * `observation` is the scan line: one specific, checkable thing about their
 * business. It is the whole email. Without it this is a discount announcement.
 */
export function FoundingCohortEmail(p: {
  businessName: string
  city: string
  observation: string
  spotsRemaining: number
  claimUrl: string
  unsubscribeUrl: string
  senderName: string
  senderTitle: string
}) {
  return (
    <BrandedEmail
      preview={`We looked at ${p.businessName} and saved you a spot.`}
      category="Founding cohort"
    >
      <EmailEyebrow>Texas founding cohort</EmailEyebrow>
      <StatusBadge tone="positive">{p.spotsRemaining} spots left</StatusBadge>
      <EmailHeading>Howdy neighbor</EmailHeading>
      <Lead>
        We are Nexez, and we are building this out of Texas, so we are starting at home.
      </Lead>
      <Lead>
        When someone in {p.city} asks an assistant to find what you do, it recommends
        whoever it can actually read: prices, options, what you need from a customer
        before you will take the job. We went looking at businesses that would hold up
        in that moment and <strong>{p.businessName}</strong> came up.
      </Lead>
      <Text className="nx-ink" style={{
        borderLeft: `2px solid ${BRAND.signal}`,
        color: BRAND.ink, fontSize: '15px', lineHeight: '1.6',
        margin: '0 0 24px', padding: '2px 0 2px 16px',
      }}>
        {p.observation}
      </Text>
      <InfoRows rows={[
        ['Offer', 'Nexez Launch, six months'],
        ['Cost', 'None, and no card'],
        ['Cohort', `${p.city} and three other Texas metros`],
        ['We ask for', 'Your honest read on what breaks'],
      ]} />
      <PrimaryButton href={p.claimUrl}>Claim your spot</PrimaryButton>
      <Notice>
        We are keeping this small enough to sit with each business on how their offers get
        built. That is the part that matters, and it is why there are only {p.spotsRemaining} left.
      </Notice>
      <FinePrint>
        From one Texas business to another,<br />
        {p.senderName}, {p.senderTitle}
      </FinePrint>
      <FinePrint>
        Not interested? <Link href={p.unsubscribeUrl} className="nx-link" style={styles.link}>
          Unsubscribe
        </Link> and we will not write again.
      </FinePrint>
    </BrandedEmail>
  )
}

export function PromotionExpiryEmail(p: {
  businessName: string; daysBefore: number; endsOn: string
  fallbackListingName: string | null; billingUrl: string
}) {
  const timing = p.daysBefore === 1 ? 'tomorrow' : `in ${p.daysBefore} days`
  return (
    <BrandedEmail preview={`Your complimentary Nexez Launch access ends ${timing}.`} category="Account update">
      <EmailEyebrow>Plan</EmailEyebrow>
      <StatusBadge tone="caution">Changes {timing}</StatusBadge>
      <EmailHeading>Your Launch access is ending</EmailHeading>
      <Lead>
        <strong>{p.businessName}</strong> moves to the Free plan on {p.endsOn}. You keep your
        business on Nexez either way.
      </Lead>
      <InfoRows rows={[
        ['Plan after this', 'Free'],
        ['Listing kept live', p.fallbackListingName || 'Your oldest published listing'],
        ['Automatic charge', 'None'],
      ]} />
      <PrimaryButton href={p.billingUrl}>Review plan details</PrimaryButton>
      <FinePrint>
        Drafts and extra listings are kept. Publish them again whenever your plan limit goes up.
      </FinePrint>
    </BrandedEmail>
  )
}

/**
 * The one template that is not a notification. No StatusBadge: the badge
 * vocabulary describes what state an order or account has moved into, and a
 * brand new account has not moved into anything. "Ready" was the loudest
 * element on the page and it was saying nothing.
 *
 * Only the first name is used. A full_name off an OAuth profile renders as
 * "Welcome, Taio Smith." and, worse, the same merge field can carry a workspace
 * or company name, which is exactly how a competitor's welcome mail shipped
 * addressing us by our company name.
 */
export function firstNameOnly(name?: string | null): string | null {
  return name?.trim().split(/\s+/)[0] || null
}

export function WelcomeEmail(p: {
  name?: string | null; createUrl: string; financeUrl: string; docsUrl: string
}) {
  const first = firstNameOnly(p.name)
  return (
    <BrandedEmail preview="Three steps to a listing AI agents can read, quote, and buy from." category="Account update">
      <EmailEyebrow>Account</EmailEyebrow>
      <EmailHeading>{first ? `Welcome, ${first}.` : 'Welcome to Nexez.'}</EmailHeading>
      <Lead>
        Nexez turns your business into something an AI agent can read, quote, and buy from.
        It sits alongside your website rather than replacing it.
      </Lead>
      <Steps
        label="Three steps to your first listing"
        items={[
          'Point us at your website. We draft the listing from what is already there.',
          'Check every price, claim, and policy. Nothing goes live until you say it is right.',
          'Publish. From that moment agents can read your offer, quote it, and book it.',
        ]}
      />
      <PrimaryButton href={p.createUrl}>Create your first listing</PrimaryButton>
      <NextSteps
        label="Then, when you are ready"
        items={[
          {
            title: 'Connect Stripe',
            body: 'Payments land in your own account. Nexez only takes a fee once you get paid.',
            href: p.financeUrl,
            cta: 'Connect Stripe',
          },
          {
            title: 'See what the agents see',
            body: 'Your listing becomes an agent.json file and an MCP endpoint any assistant can read.',
            href: p.docsUrl,
            cta: 'Read the docs',
          },
        ]}
      />
      <FinePrint>Stuck anywhere? Reply to this email and a person will help.</FinePrint>
    </BrandedEmail>
  )
}

export function StripeConnectedEmail(p: {
  financeUrl: string; listingsUrl: string; docsUrl: string
}) {
  return (
    <BrandedEmail preview="Stripe is connected and your account can accept payments." category="Account update">
      <EmailEyebrow>Payments</EmailEyebrow>
      <StatusBadge tone="positive">Charges enabled</StatusBadge>
      <EmailHeading>Stripe is connected</EmailHeading>
      <Lead>
        Buyer payments on eligible Nexez checkout paths now go straight to your own account.
      </Lead>
      <InfoRows rows={[
        ['Merchant of record', 'Your business'],
        ['Payout destination', 'Your connected Stripe account'],
        ['Nexez fee', 'Only when you get paid'],
      ]} />
      <PrimaryButton href={p.financeUrl}>Open Finance</PrimaryButton>
      <NextSteps
        label="What this unlocks"
        items={[
          {
            title: 'Check a listing is live',
            body: 'Connecting Stripe does not create a way to buy. Payments reach you through a published listing.',
            href: p.listingsUrl,
            cta: 'Open your listings',
          },
          {
            title: 'See the checkout an agent runs',
            body: 'The protocol endpoints an assistant calls when it buys on a customer’s behalf.',
            href: p.docsUrl,
            cta: 'Read the docs',
          },
        ]}
      />
      <FinePrint>Being connected is not the same as being paid. No payout is due yet.</FinePrint>
    </BrandedEmail>
  )
}

export function StaleListingEmail(p: {
  businessName: string; listingName: string; freshnessLabel: string
  reinterviewUrl: string; editUrl: string
}) {
  return (
    <BrandedEmail preview={`Review “${p.listingName}” to keep agent-facing details current.`} category="Merchant action">
      <EmailEyebrow>Listing</EmailEyebrow>
      {/* No badge: "Review suggested" is the heading and the button saying it a
          third time. The listing's actual state is the Freshness row. */}
      <EmailHeading>Keep this listing accurate</EmailHeading>
      <Lead>
        <strong>{p.listingName}</strong> has not changed in a while. A short review stops agents
        quoting a price or an opening you no longer honour.
      </Lead>
      <InfoRows rows={[
        ['Business', p.businessName],
        ['Listing', p.listingName],
        ['Freshness', p.freshnessLabel],
      ]} />
      <PrimaryButton href={p.reinterviewUrl}>Review with Nexez</PrimaryButton>
      <FinePrint>
        Prefer the full editor?{' '}
        <Link href={p.editUrl} className="nx-link" style={styles.link}>Open the listing builder</Link>.
        We send these sparingly.
      </FinePrint>
    </BrandedEmail>
  )
}

/*
 * ── Growth campaign lifecycle ────────────────────────────────────────────────
 *
 * Three moments the campaign had no voice for. The order matters, because each
 * one answers the question the previous one leaves open:
 *
 *   invite   -> SellerGrowthInviteEmail / FoundingCohortEmail   "there is a spot"
 *   reserved -> PublishNudgeEmail                               "it is still yours"
 *   issued   -> LaunchAccessStartedEmail                        "it started, here is when it ends"
 *
 * The reserved state exists because a grant is only minted once a listing is
 * actually live. Someone who signs up and stalls owns a spot that is burning no
 * time and hears nothing, which reads as though the offer evaporated.
 */

/**
 * Fires once, when the database mints the grant. That happens on the write that
 * publishes the owner's first listing, so this doubles as the "you are live"
 * email and must name the listing that triggered it.
 *
 * `endsOn` is already formatted for display by the caller; the six-month figure
 * is campaign configuration (`grant_duration_days`), never hardcoded here.
 */
export function LaunchAccessStartedEmail(p: {
  businessName: string
  listingName: string
  durationLabel: string
  endsOn: string
  dashboardUrl: string
}) {
  return (
    <BrandedEmail
      preview={`${p.listingName} is live, and your Launch access has started.`}
      category="Account update"
    >
      <EmailEyebrow>Plan</EmailEyebrow>
      <StatusBadge tone="positive">Launch active</StatusBadge>
      <EmailHeading>Your listing is live, and so is Launch</EmailHeading>
      <Lead>
        <strong>{p.listingName}</strong> is published, which is what starts your complimentary
        access. Nothing was charged and no card is on file.
      </Lead>
      <InfoRows rows={[
        ['Business', p.businessName],
        ['Plan', `Nexez Launch, ${p.durationLabel}`],
        ['Started by', p.listingName],
        ['Runs until', p.endsOn],
      ]} />
      <PrimaryButton href={p.dashboardUrl}>Open your dashboard</PrimaryButton>
      <Notice>
        On {p.endsOn} you move to Free automatically. We do not ask for a card to
        begin and we will not charge you to end.
      </Notice>
      <FinePrint>
        We will write once more before that date so it is never a surprise.
      </FinePrint>
    </BrandedEmail>
  )
}

/**
 * The stall. They claimed a spot but no listing is live, so no grant exists and
 * no clock is running.
 *
 * The single job of this email is to say that the time has not started, because
 * the reasonable assumption is the opposite. Everything else is secondary.
 */
export function PublishNudgeEmail(p: {
  businessName: string
  durationLabel: string
  reservedUntil: string | null
  publishUrl: string
}) {
  return (
    <BrandedEmail
      preview="Your Launch spot is reserved. The clock starts when you publish."
      category="Account update"
    >
      <EmailEyebrow>Launch access</EmailEyebrow>
      <StatusBadge tone="caution">Not started yet</StatusBadge>
      <EmailHeading>Your spot is still reserved</EmailHeading>
      <Lead>
        <strong>{p.businessName}</strong> has a place in the cohort and none of it has been
        used. Your {p.durationLabel} begins on the day your first listing goes live, not
        the day you signed up.
      </Lead>
      <InfoRows rows={[
        ['Access', `Nexez Launch, ${p.durationLabel}`],
        ['Time used so far', 'None'],
        ['Starts when', 'Your first listing is published'],
        ['Held until', p.reservedUntil || 'The cohort fills'],
      ]} />
      <PrimaryButton href={p.publishUrl}>Finish your listing</PrimaryButton>
      <Notice>
        Publishing is what starts it, so there is no cost to taking another week over
        the details. A listing that is wrong is worse than one that is late.
      </Notice>
      <FinePrint>Stuck on a section? Reply to this email and a person will help.</FinePrint>
    </BrandedEmail>
  )
}

/**
 * Score bands for the readability scan. Exported because the subject line and
 * the plain-text part need the same words the badge uses, and deriving them
 * twice is how a "Hard to read" badge ends up under an "Agent ready" subject.
 *
 * The bands are deliberately blunt. A merchant reading their own score does not
 * need eleven gradations, they need to know whether an assistant can use their
 * site at all.
 */
export function scanReadinessBand(score: number): { tone: EmailTone; label: string } {
  if (score >= 70) return { tone: 'positive', label: 'Agent ready' }
  if (score >= 40) return { tone: 'caution', label: 'Partly readable' }
  return { tone: 'danger', label: 'Hard to read' }
}

/**
 * Scan results for someone with no account, sent because they asked for them on
 * the public scan page.
 *
 * The findings carry the email. The offer sits underneath as the answer to a
 * problem they have just been shown, which is the only framing that earns it.
 * Cold-ish recipient, so it carries an unsubscribe.
 */
/**
 * Status travels with each row because the scanner already knows it: the outcome
 * words come from a closed map over CrawlCheck['status'] in lib/scan-findings.
 * Rows persisted before that map was widened arrive without one and render
 * neutral, which is the honest reading of "we no longer know".
 */
export type ScanFindingRow = [label: string, outcome: string, status?: 'pass' | 'warn' | 'fail']

const FINDING_TONES = { pass: 'positive', warn: 'caution', fail: 'danger' } as const

export function ScanResultsEmail(p: {
  domain: string
  score: number
  findings: ScanFindingRow[]
  claimUrl: string
  unsubscribeUrl: string
}) {
  const band = scanReadinessBand(p.score)
  return (
    <BrandedEmail
      preview={`${p.domain} scored ${p.score} out of 100 for agent readability.`}
      category="Account update"
    >
      <EmailEyebrow>Scan</EmailEyebrow>
      <StatusBadge tone={band.tone}>{band.label}</StatusBadge>
      <EmailHeading>What agents can read on {p.domain}</EmailHeading>
      <Lead>
        You scored <Data>{p.score}</Data> out of 100. That is not a marketing grade. It is
        how much of your business an AI assistant can actually parse when a customer
        asks it to find someone who does what you do.
      </Lead>
      <Findings items={p.findings.map(([label, outcome, status]) => ({
        label,
        outcome,
        tone: status ? FINDING_TONES[status] : 'neutral',
      }))} />
      <Caption>
        Every line above is a thing an assistant looks for and either finds or does not.
        Nothing here is an opinion about your website.
      </Caption>
      <PrimaryButton href={p.claimUrl}>Fix this on Nexez</PrimaryButton>
      <Notice>
        Six months of Nexez Launch, no card. Your access starts the day your listing
        goes live, so nothing runs down while you get it right.
      </Notice>
      <FinePrint>
        We ran this once because you asked for it and we keep no copy of your site.{' '}
        <Link href={p.unsubscribeUrl} className="nx-link" style={styles.link}>Unsubscribe</Link>{' '}
        and we will not write again.
      </FinePrint>
    </BrandedEmail>
  )
}
