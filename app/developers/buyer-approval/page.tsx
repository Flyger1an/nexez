import type { Metadata } from 'next'
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Code2,
  CreditCard,
  HandCoins,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { CodeCopyButton } from '../../../components/CodeCopyButton'
import { agentRuntimeUrl, marketingUrl } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Buyer Approval UX',
  description:
    'The Nexez consent boundary for dry runs, checkout, booking, contact sharing, negotiation submission, recovery, and approval-bound agent actions.',
  alternates: {
    canonical: marketingUrl('/developers/buyer-approval'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/developers/buyer-approval'),
    title: 'Buyer Approval UX',
    description:
      'The Nexez consent boundary for dry runs, checkout, booking, contact sharing, negotiation submission, recovery, and approval-bound agent actions.',
  },
}

const approvalSchema = {
  schema_version: 'nexez.buyer-approval.v1',
  requires_buyer_approval: true,
  action_type: 'submit_negotiation',
  seller: {
    name: 'Nexez Agent Negotiation Lab',
    slug: 'nexez-agent-negotiation-lab',
    public_url: 'https://nexez.app/nexez-agent-negotiation-lab',
    website_url: 'https://nexez.ai/agents',
    location: 'Remote - worldwide',
  },
  offer: {
    key: 'services-0',
    name: 'AI Agent Negotiation Sprint',
    price: '$2,500',
    summary: 'A focused service package for agent-readable offers and smart negotiation routing.',
    checkout_url: 'https://nexez.app/checkout/nexez-agent-negotiation-lab?offer=services-0',
  },
  proposal: {
    query: 'Buyer wants a one-week agent negotiation sprint.',
    budget: 'USD 2100',
    timeline: 'next week',
    requested_terms: {
      scope: 'Discovery call, offer review, and dry-run guidance.',
    },
    contact_shared: false,
    contact_share_status: 'pending_approval',
    contact_to_share: 'buyer@example.com',
    contact_destination: 'Nexez Agent Negotiation Lab',
  },
  dry_run: {
    ok: true,
    dryRun: true,
    rulesEvaluation: {
      decision: 'auto_accept',
      reasons: ['meets_pricing_rules'],
    },
  },
  risk_notes: [
    'No money should move before the buyer approves.',
    'No buyer contact details should be sent before approval.',
    'Dry-run validation may log an analytics attempt, but it does not create checkout, seller contact, or a negotiation.',
  ],
  buyer_copy: {
    title: 'Nexez Agent Negotiation Lab - AI Agent Negotiation Sprint',
    body:
      'I found AI Agent Negotiation Sprint from Nexez Agent Negotiation Lab at $2,500. I can send this proposal using your budget (USD 2100) and timeline (next week). This will share buyer@example.com with Nexez Agent Negotiation Lab.',
    confirmation_question: 'Do you approve this proposal submission?',
    approve_label: 'Approve negotiation submission',
    cancel_label: 'Cancel',
  },
}

const schemaText = JSON.stringify(approvalSchema, null, 2)

const typescriptExample = `import { createNexezClient } from '@nexez/agent-sdk'

const nexez = createNexezClient({ buyerAgent: 'buyer-agent' })
const contactToShare = 'buyer@example.com'

const proposal = {
  slug: 'nexez-agent-negotiation-lab',
  offer: 'services-0',
  query: 'Buyer wants a one-week agent negotiation sprint.',
  budget: 'USD 2100',
  timeline: 'next week',
}

const dryRun = await nexez.validateNegotiation(proposal)

const approval = {
  schema_version: 'nexez.buyer-approval.v1',
  requires_buyer_approval: true,
  action_type: 'submit_negotiation',
  proposal: {
    ...proposal,
    contact_shared: false,
    contact_share_status: 'pending_approval',
    contact_to_share: contactToShare,
    contact_destination: 'Nexez Agent Negotiation Lab',
  },
  dry_run: dryRun,
  buyer_copy: {
    title: 'AI Agent Negotiation Sprint',
    body: 'I can send this proposal and buyer@example.com to Nexez Agent Negotiation Lab.',
    confirmation_question: 'Do you approve this proposal submission?',
    approve_label: 'Approve negotiation submission',
    cancel_label: 'Cancel',
  },
}

// Replace this false value with the result of a real UI or voice approval event.
const approvedByBuyer = false
if (!approvedByBuyer) throw new Error('Buyer approval is required before submission.')

const submitted = await nexez.submitNegotiation({
  ...proposal,
  contact: contactToShare,
  userApproved: true,
})

if (submitted.negotiationId && submitted.statusToken) {
  await nexez.waitForNegotiationDecision({
    negotiationId: submitted.negotiationId,
    statusToken: submitted.statusToken,
    timeoutMs: 30_000,
    intervalMs: 2_000,
  })
}`

const approvalVariants = [
  {
    icon: CreditCard,
    label: 'Checkout',
    action: 'open_checkout',
    title: 'Approve checkout handoff',
    copy: 'Use when an agent will open a payment, booking, or checkout URL for a specific offer.',
  },
  {
    icon: HandCoins,
    label: 'Negotiation',
    action: 'submit_negotiation',
    title: 'Approve negotiation submission',
    copy: 'Use when an agent will send proposed terms, budget, timeline, or buyer contact to a seller.',
  },
  {
    icon: Mail,
    label: 'Contact',
    action: 'share_contact',
    title: 'Approve contact sharing',
    copy: 'Use when an agent will share email, phone, company details, location, or custom buyer context.',
  },
  {
    icon: BadgeCheck,
    label: 'Booking',
    action: 'book_service',
    title: 'Approve booking request',
    copy: 'Use when an agent will reserve a time, request availability, or start a scheduling workflow.',
  },
]

const approvalRules = [
  'Dry-run validation can happen before approval. Checkout validation may record an analytics attempt, but it does not create a session or contact the seller.',
  'Opening checkout requires approval.',
  'Submitting negotiation terms requires approval.',
  'Sharing contact or location requires approval.',
  'Booking or reserving time requires approval.',
  'Agents should show the exact next action and destination.',
]

const schemaFields = [
  ['schema_version', 'Stable object version for agent renderers.'],
  ['action_type', 'The side effect the buyer is approving.'],
  ['seller', 'Name, public URL, website, and location.'],
  ['offer', 'Offer key, title, price, summary, and checkout URL.'],
  ['proposal', 'Budget, timeline, buyer request, plus the exact contact, destination, and pending approval status.'],
  ['dry_run', 'Validation result from checkout or negotiation endpoint.'],
  ['risk_notes', 'Short warnings the agent should not hide.'],
  ['buyer_copy', 'Human-facing title, body, question, and button labels.'],
]

export default function BuyerApprovalPage() {
  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
        </div>
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.92fr)_minmax(380px,0.78fr)] lg:items-center lg:py-24">
          <div>
            <div className="eyebrow">Buyer approval UX</div>
            <h1 className="mt-5 max-w-4xl text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              Consent patterns for <span className="nx-accent-text">agent commerce.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Analysis may search, compare, and dry-run safely. Consequential action stops here: Nexez exposes the
              seller, offer, terms, destination, shared data, risk notes, and recovery-safe approval state before
              checkout, negotiation, booking, or contact sharing proceeds.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#schema" className="btn-primary h-11 px-5">
                View schema
                <ArrowRight className="size-4" />
              </a>
              <a href="/docs#buyer-agent" className="btn-secondary h-11 px-5">
                Approval documentation
              </a>
            </div>
            <a href="/agents" className="mt-4 inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground">
              Continue to Agent Access
            </a>
          </div>

          <ApprovalCardPreview />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div>
              <p className="text-sm font-medium text-[var(--signal)]">Action gates</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                Approval changes by action.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                The copy should name the seller, the offer, what information is being sent, and the next side effect.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {approvalVariants.map((variant) => {
                const Icon = variant.icon
                return (
                  <div key={variant.action} className="nx-tile p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-md border border-[var(--signal)]/25 bg-[var(--signal)]/10">
                          <Icon className="size-5 text-[var(--signal)]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{variant.label}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{variant.action}</p>
                        </div>
                      </div>
                    </div>
                    <h3 className="mt-5 text-lg font-medium tracking-tight">{variant.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{variant.copy}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-medium text-[var(--signal)]">Renderer rules</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Dry run first. Ask before action.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              The approval card is the boundary between analysis and action. A buyer agent can search, compare,
              and validate safely, then pause for a clear approve or cancel decision.
            </p>
          </div>
          <div className="grid gap-3">
            {approvalRules.map((rule) => (
              <div key={rule} className="flex gap-3 rounded-lg border border-border bg-white/[0.03] p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--ready)]" />
                <p className="text-sm leading-6 text-muted-foreground">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="schema" className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-[0.74fr_1.26fr] lg:items-start">
          <div>
            <p className="text-sm font-medium text-[var(--signal)]">Schema</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              `nexez.buyer-approval.v1`
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              This object is intentionally small enough for chat UIs, voice agents, mobile buyer apps, and tool
              runners. It pairs machine-readable fields with buyer-facing copy.
            </p>
            <div className="mt-6 grid gap-2">
              {schemaFields.map(([field, copy]) => (
                <div key={field} className="rounded-lg border border-border bg-white/[0.025] p-3">
                  <p className="font-mono text-xs text-white">{field}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="nx-glass-panel overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md border border-border bg-black/40">
                  <Code2 className="size-4 text-[var(--signal)]" />
                </div>
                <div>
                  <p className="text-sm font-medium">approval.json</p>
                  <p className="font-mono text-xs text-muted-foreground">schema / dry-run / buyer copy</p>
                </div>
              </div>
              <CodeCopyButton text={schemaText} />
            </div>
            <pre className="max-h-[720px] max-w-full overflow-auto p-5 text-left font-mono text-[11px] leading-5 text-[var(--fg-muted-2)]">
              <code>{schemaText}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="nx-glass-panel overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md border border-border bg-black/40">
                  <Code2 className="size-4 text-[var(--signal)]" />
                </div>
                <div>
                  <p className="text-sm font-medium">buyer-approval.ts</p>
                  <p className="font-mono text-xs text-muted-foreground">validate / render / wait</p>
                </div>
              </div>
              <CodeCopyButton text={typescriptExample} />
            </div>
            <pre className="max-w-full overflow-auto p-5 text-left font-mono text-[11px] leading-5 text-[var(--fg-muted-2)]">
              <code>{typescriptExample}</code>
            </pre>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--signal)]">Examples</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Copy the approval boundary.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              The repository includes TypeScript and Python examples that produce the approval object, stop by
              default, and only continue after a real buyer approval event.
            </p>
            <div className="mt-6 grid gap-3">
              <a
                href="https://github.com/nexez-ai/nexez-agent-examples/blob/main/typescript/buyer-approval.ts"
                className="rounded-lg border border-border bg-white/[0.03] p-4 transition hover:border-[var(--signal)]/40 hover:bg-white/[0.055]"
              >
                <p className="text-sm font-medium">TypeScript buyer approval</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">typescript/buyer-approval.ts</p>
              </a>
              <a
                href="https://github.com/nexez-ai/nexez-agent-examples/blob/main/python/buyer_approval.py"
                className="rounded-lg border border-border bg-white/[0.03] p-4 transition hover:border-[var(--signal)]/40 hover:bg-white/[0.055]"
              >
                <p className="text-sm font-medium">Python buyer approval</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">python/buyer_approval.py</p>
              </a>
              <a
                href={agentRuntimeUrl('/openapi.json')}
                className="rounded-lg border border-border bg-white/[0.03] p-4 transition hover:border-[var(--signal)]/40 hover:bg-white/[0.055]"
              >
                <p className="text-sm font-medium">OpenAPI surface</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{agentRuntimeUrl('/openapi.json')}</p>
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function ApprovalCardPreview() {
  return (
    <div className="nx-glass-panel p-5">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border border-[var(--signal)]/25 bg-[var(--signal)]/10">
            <ShieldCheck className="size-5 text-[var(--signal)]" />
          </div>
          <div>
            <p className="text-sm font-medium">Approval required</p>
            <p className="font-mono text-xs text-muted-foreground">nexez.buyer-approval.v1</p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-3 py-1 text-xs font-medium text-[var(--ready)]">
          Dry-run passed
        </span>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Seller</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Nexez Agent Negotiation Lab</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          AI Agent Negotiation Sprint - $2,500
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-white/[0.025] p-4">
          <p className="text-xs text-muted-foreground">Budget</p>
          <p className="mt-1 font-mono text-sm text-white">USD 2100</p>
        </div>
        <div className="rounded-lg border border-border bg-white/[0.025] p-4">
          <p className="text-xs text-muted-foreground">Timeline</p>
          <p className="mt-1 font-mono text-sm text-white">next week</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--warning)]/25 bg-[var(--warning)]/10 p-4">
        <p className="text-sm font-medium text-[var(--warning)]">Before I send this</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          I will share your proposal terms and buyer@example.com with Nexez Agent Negotiation Lab. No payment starts
          from this step.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button className="btn-primary h-11 flex-1 px-5" type="button">
          Approve negotiation submission
        </button>
        <button className="btn-secondary h-11 flex-1 px-5" type="button">
          Cancel
        </button>
      </div>
    </div>
  )
}
