import { ArrowRight, Bot, CheckCircle2, ScanLine } from 'lucide-react'
import { commerceExamplePath, getPublicCommerceExamples } from '../../lib/commerce-templates/public'
import { appUrl } from '../../lib/site'

function humanize(value: string) {
  return value.replace(/-/g, ' ')
}

export function CommerceExamplesProof() {
  const examples = getPublicCommerceExamples()

  return (
    <section className="border-b border-border bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--amber)]">Commerce example library</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              See how Nexez represents different ways services are actually bought.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              These are reference templates, not live providers. Each example shows the buying intent, offer shape,
              and questions an agent needs answered before it can transact safely.
            </p>
          </div>
          <a href={appUrl('/create')} className="btn-primary h-11 px-5">
            Build your version
            <ArrowRight className="size-4" />
          </a>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {examples.map((example) => (
            <a key={example.id} href={commerceExamplePath(example.id)} className="nx-tile group block p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[var(--amber)]">
                  <ScanLine className="size-5" />
                  <p className="font-mono text-xs uppercase tracking-[0.16em]">Nexez Example</p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {humanize(example.archetype)}
                </span>
              </div>

              <p className="mt-5 text-xs font-medium text-muted-foreground">{example.industry}</p>
              <h3 className="mt-2 text-2xl font-medium tracking-tight group-hover:text-white">{example.title.replace(' — Nexez Example', '')}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{example.description}</p>

              <div className="mt-5 space-y-2">
                {example.offers.slice(0, 2).map((offer) => (
                  <div key={offer.name} className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-[var(--ready)]" />
                    {offer.name}
                  </div>
                ))}
              </div>

              {example.tryAsking[0] ? (
                <div className="mt-5 rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/5 p-3">
                  <div className="flex items-center gap-2 text-[var(--signal)]">
                    <Bot className="size-4" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em]">Try asking Nexez</p>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">“{example.tryAsking[0]}”</p>
                </div>
              ) : null}

              <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--amber)]">
                View reference example
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </div>
            </a>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-[var(--amber)]/25 bg-[var(--amber)]/10 p-5">
          <p className="text-sm font-medium text-[var(--amber)]">Reference examples, not live providers</p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            Example pages do not claim a provider identity, service area, availability, reviews, or a payment destination.
            A real merchant must confirm its own facts before Nexez can publish or transact on its behalf.
          </p>
        </div>
      </div>
    </section>
  )
}
