import { ArrowRight, BadgeCheck, Bot, CheckCircle2, Code2, FileText, ScanLine, ShieldCheck, Sparkles, Target } from 'lucide-react'
import { AGENT_READY_STANDARD, getReadinessCriteria } from '../../lib/agent-page'
import { appUrl } from '../../lib/site'

const badSignals = [
  'Services are scattered across six nav pages.',
  'Pricing is hidden behind "Contact us".',
  'Booking action is detached from the offer.',
  'Policies live in a footer PDF.',
]

const agentPayload = `{
  "business": "Nexez Agency",
  "best_fit": "B2B founders",
  "offers": [
    {
      "name": "Strategy Session",
      "price": "$450",
      "duration": "60 minutes",
      "action": "book"
    }
  ],
  "trust": ["verified_domain", "calendar_link"],
  "readiness": 92
}`

export function HowItWorksProof() {
  return (
    <section className="border-b border-border bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-medium text-[var(--signal)]">The proof</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
            Your website can be beautiful and still hard for agents.
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
            Nexez is the layer that turns messy marketing context into explicit buying context. The main website stays
            persuasive. The agent listing becomes precise.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_0.1fr_0.95fr] lg:items-stretch">
          <div className="nx-tile p-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="size-5" />
              <h3 className="text-lg font-medium text-white">Normal website scrape</h3>
            </div>
            <div className="mt-5 space-y-3">
              {badSignals.map((signal) => (
                <div key={signal} className="rounded-lg border border-border bg-black/25 p-4 text-sm leading-6 text-muted-foreground">
                  {signal}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-4">
              <p className="text-sm font-medium text-[var(--amber)]">Agent result</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                "I found the company, but I cannot confidently identify the exact service, price, or booking path."
              </p>
            </div>
          </div>

          <div className="hidden items-center justify-center lg:flex">
            <div className="flex size-12 items-center justify-center rounded-full border border-[var(--signal)]/40 bg-[var(--signal)]/10">
              <ArrowRight className="size-5 text-[var(--signal)]" />
            </div>
          </div>

          <div className="nx-tile p-6">
            <div className="flex items-center gap-2 text-[var(--signal)]">
              <Code2 className="size-5" />
              <h3 className="text-lg font-medium text-white">Nexez agent listing</h3>
            </div>
            <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-black/30 p-4 font-mono text-xs leading-6 text-zinc-300">
              <code>{agentPayload}</code>
            </pre>
            <div className="mt-5 rounded-lg border border-[var(--ready)]/30 bg-[var(--ready)]/10 p-4">
              <p className="text-sm font-medium text-[var(--ready)]">Agent result</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                "This is a 60-minute B2B strategy session for $450. The buyer can book directly."
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const readinessChecks = [
  {
    title: 'Parse',
    score: '94',
    copy: 'Offers are named, scoped, priced, and attached to a next action.',
  },
  {
    title: 'Verify',
    score: '88',
    copy: 'Domain, website, contact path, availability, and policies line up.',
  },
  {
    title: 'Act',
    score: '92',
    copy: 'The agent can book, buy, request a quote, or ask for human review.',
  },
]

export function AgentReadinessProof() {
  return (
    <section className="border-b border-border bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-medium text-[var(--ready)]">Readiness is practical</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              The question is not "is this page pretty?"
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              The better question is: can an agent understand the offer, trust it enough to recommend, and take the
              next step without inventing missing details?
            </p>
            <a href="/simulator" className="btn-secondary mt-7 h-11 px-5">
              Test a listing
              <ArrowRight className="size-4" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {readinessChecks.map((check) => (
              <div key={check.title} className="nx-tile p-5">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-medium">{check.title}</p>
                  <span className="font-mono text-2xl font-semibold text-[var(--ready)]">{check.score}</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[var(--ready)]" style={{ width: `${check.score}%` }} />
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{check.copy}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-[var(--ready)]/25 bg-[var(--ready)]/10 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <Bot className="size-6 shrink-0 text-[var(--ready)]" />
            <div>
              <p className="text-sm font-medium text-[var(--ready)]">Simulated agent recommendation</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                "Recommend Nexez Agency if the user wants a focused B2B advisory call this week. The listing clearly lists
                duration, price, calendar action, and follow-up path. If the request is broader than one session, route
                them to the retainer offer instead."
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const standardCriteria = getReadinessCriteria({})
const certificationAreas = [
  {
    title: 'Identity',
    description: 'Agents can identify the business and resolve its canonical source.',
    criteria: standardCriteria.filter((item) => ['name', 'slug', 'description', 'website_url'].includes(item.id)),
  },
  {
    title: 'Buyer match',
    description: 'The listing states who it serves, where it operates, and how it should be categorized.',
    criteria: standardCriteria.filter((item) => ['audience', 'industry', 'location_or_contact'].includes(item.id)),
  },
  {
    title: 'Offer clarity',
    description: 'At least one explicit offer and practical buyer questions are available to compare.',
    criteria: standardCriteria.filter((item) => ['offers', 'faqs'].includes(item.id)),
  },
  {
    title: 'Action and access',
    description: 'A buyer has a clear next action and agents can reach the live listing.',
    criteria: standardCriteria.filter((item) => ['cta_url', 'publish'].includes(item.id)),
  },
]

export function AgentReadyCertificationStandard() {
  return (
    <section id="certification-standard" className="scroll-mt-24 border-b border-border">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.72fr] lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-[var(--signal)]">
              <BadgeCheck className="size-5" />
              <p className="text-sm font-medium">{AGENT_READY_STANDARD.label}</p>
            </div>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold md:text-5xl">
              A live standard, not a one-time sticker.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              Certification confirms that a published listing carries the identity, offer, buyer context, and action
              fields an agent needs to proceed without inventing missing facts. Nexez evaluates it continuously, so
              the claim disappears if a required check stops passing.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-muted-foreground">{AGENT_READY_STANDARD.id}</p>
                <p className="mt-1 text-lg font-medium">Standard {AGENT_READY_STANDARD.version}</p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-md border border-[var(--ready)]/30 bg-[var(--ready)]/10">
                <ShieldCheck className="size-5 text-[var(--ready)]" />
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-black/20 p-3">
                <dt className="text-xs text-muted-foreground">Required score</dt>
                <dd className="mt-1 font-mono text-xl font-semibold text-[var(--ready)]">{AGENT_READY_STANDARD.threshold}%</dd>
              </div>
              <div className="rounded-md border border-border bg-black/20 p-3">
                <dt className="text-xs text-muted-foreground">Required checks</dt>
                <dd className="mt-1 font-mono text-xl font-semibold text-[var(--ready)]">{standardCriteria.length}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Every badge has a live <code className="font-mono text-foreground">badge.json</code> verification
              record. Agents can inspect the standard version, current status, score, and any missing checks.
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {certificationAreas.map((area) => (
            <div key={area.title} className="nx-tile p-5">
              <h3 className="text-base font-medium">{area.title}</h3>
              <p className="mt-2 min-h-12 text-xs leading-5 text-muted-foreground">{area.description}</p>
              <ul className="mt-4 space-y-2">
                {area.criteria.map((criterion) => (
                  <li key={criterion.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-[var(--ready)]" />
                    {criterion.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 border-y border-border py-6 md:grid-cols-3">
          <div>
            <p className="text-sm font-medium">Technical certification</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Confirms complete, published agent-readable buying context. It is deterministic and revocable.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Trust and verification</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Measures separate evidence such as domain control, reviewed credentials, and completed transactions.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Marketplace curation</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Governs discovery eligibility through a separate human quality review. Certification alone does not
              guarantee ranking or marketplace admission.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={appUrl('/create')} className="btn-primary h-11 px-5">
            Build a certifiable listing
            <ArrowRight className="size-4" />
          </a>
          <a href="/scan" className="btn-secondary h-11 px-5">
            Scan your current site
          </a>
        </div>
      </div>
    </section>
  )
}

const templates = [
  {
    id: 'consulting',
    title: 'Consulting session',
    intent: 'Book expert help next week',
    offers: ['Strategy Session', 'Fixed Audit', 'Retainer'],
    proof: 'Best for advisory, coaching, agency, legal, accounting, and fractional work.',
  },
  {
    id: 'local-service',
    title: 'Local service booking',
    intent: 'Find someone nearby and available',
    offers: ['Emergency Visit', 'Standard Appointment', 'Quote Request'],
    proof: 'Best for home services, wellness, events, rentals, and field service businesses.',
  },
  {
    id: 'productized-package',
    title: 'Productized package',
    intent: 'Compare scope and buy directly',
    offers: ['Starter Package', 'Implementation', 'Bulk Order'],
    proof: 'Best for digital products, SaaS setup, e-commerce bundles, and implementation work.',
  },
]

export function ExamplesProof() {
  return (
    <section className="border-b border-border bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--amber)]">Template gallery</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Start with a buying pattern, not a blank page.
            </h2>
          </div>
          <a href={appUrl('/create?template=consulting')} className="btn-primary h-11 px-5">
            Start from a template
            <ArrowRight className="size-4" />
          </a>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {templates.map((template) => (
            <a
              key={template.title}
              href={appUrl(`/create?template=${template.id}`)}
              className="nx-tile group block p-6"
            >
              <div className="flex items-center gap-2 text-[var(--amber)]">
                <ScanLine className="size-5" />
                <p className="font-mono text-xs uppercase tracking-[0.16em]">Template</p>
              </div>
              <h3 className="mt-4 text-2xl font-medium tracking-tight group-hover:text-white">{template.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.intent}</p>
              <div className="mt-5 space-y-2">
                {template.offers.map((offer) => (
                  <div key={offer} className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm">
                    <CheckCircle2 className="size-4 text-[var(--ready)]" />
                    {offer}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs leading-5 text-muted-foreground">{template.proof}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--amber)]">
                Use this template
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </div>
            </a>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-[var(--signal)]">
              <Sparkles className="size-5" />
              <h3 className="font-medium">Before publish</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Nexez should help the user shorten long descriptions, choose action labels, add missing price signals,
              and check whether each offer has enough context for agents.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-[var(--ready)]">
              <Target className="size-5" />
              <h3 className="font-medium">After publish</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The final listing should make the buyer intent obvious: what the offer is, who it is for, what it costs,
              what happens next, and how an agent can safely hand off.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
