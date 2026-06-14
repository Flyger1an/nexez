import type { Metadata } from 'next'
import { ArrowRight, Bot, CheckCircle2 } from 'lucide-react'
import { appUrl } from '../../lib/site'
import { useCases } from '../../lib/marketing-content'

export const metadata: Metadata = {
  title: 'Use Cases',
  description:
    'Explore how consultants, agencies, coaches, local services, SaaS teams, and marketplaces use Nexez to publish AI-readable buying pages.',
}

export default function UseCasesPage() {
  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
          <div className="nx-orb nx-orb--purple !opacity-20" />
          <div className="nx-orb nx-orb--teal !opacity-20" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:py-24">
          <div className="max-w-3xl">
            <div className="eyebrow">Use cases</div>
            <h1 className="mt-5 text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              AI-ready pages for <span className="nx-accent-text">real buying workflows.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Nexez is strongest when the offer is specific: a service, a package, a retainer, a booking, a quote,
              or a product with a clear next step. Start with the use case closest to your business.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={appUrl('/create')} className="btn-primary h-11 px-5">
                Create your page
                <ArrowRight className="size-4" />
              </a>
              <a href="/examples" className="btn-secondary h-11 px-5">View examples</a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">Choose your lane</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              The best agent pages start with buyer intent.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {useCases.map((useCase) => (
              <a key={useCase.slug} href={`/use-cases/${useCase.slug}`} className="nx-tile group block p-6">
                <div className="flex items-center gap-2 text-[var(--signal)]">
                  <Bot className="size-5" />
                  <span className="font-mono text-xs uppercase tracking-[0.16em]">{useCase.label}</span>
                </div>
                <h3 className="mt-4 text-2xl font-medium tracking-tight group-hover:text-white">
                  {useCase.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{useCase.description}</p>
                <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
                  Read use case
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-medium text-muted-foreground">What all use cases share</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Clear offer, clear proof, clear action.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              The industry changes, but the agent question is consistent: can this business solve the request, at what
              cost, under what constraints, and what is the next safe step?
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Offer model', 'Services, products, packages, retainers, and bookings are structured into comparable records.'],
              ['Trust context', 'Policies, location, website, contact, verification, and freshness signals help agents avoid bad recommendations.'],
              ['Action path', 'Every page points to booking, buying, quote request, contact, negotiation, or human review.'],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-lg border border-border bg-white/[0.03] p-5">
                <CheckCircle2 className="size-5 text-[var(--ready)]" />
                <h3 className="mt-4 text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
