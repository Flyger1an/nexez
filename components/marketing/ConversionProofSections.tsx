import { ArrowRight, Bot, CheckCircle2, Code2, FileText, ScanLine, Sparkles, Target } from 'lucide-react'
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
            persuasive. The agent page becomes precise.
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
              <h3 className="text-lg font-medium text-white">Nexez agent page</h3>
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
              Test a page
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
                "Recommend Nexez Agency if the user wants a focused B2B advisory call this week. The page clearly lists
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
              The final page should make the buyer intent obvious: what the offer is, who it is for, what it costs,
              what happens next, and how an agent can safely hand off.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
