import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight, CheckCircle2, Search } from 'lucide-react'
import { appUrl, marketingUrl } from '../../../lib/site'
import { getUseCase, useCases } from '../../../lib/marketing-content'

type UseCaseProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return useCases.map((useCase) => ({ slug: useCase.slug }))
}

export async function generateMetadata({ params }: UseCaseProps): Promise<Metadata> {
  const { slug } = await params
  const useCase = getUseCase(slug)
  if (!useCase) return {}

  return {
    title: `${useCase.label} Use Case`,
    description: useCase.description,
    alternates: {
      canonical: marketingUrl(`/use-cases/${useCase.slug}`),
    },
    // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
    openGraph: {
      type: 'website',
      siteName: 'Nexez',
      url: marketingUrl(`/use-cases/${useCase.slug}`),
      title: `${useCase.label} Use Case`,
      description: useCase.description,
    },
  }
}

export default async function UseCaseDetailPage({ params }: UseCaseProps) {
  const { slug } = await params
  const useCase = getUseCase(slug)
  if (!useCase) notFound()

  // Service schema from the same content the page renders — never invented copy.
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Agent-ready listings for ${useCase.label.toLowerCase()}`,
    description: useCase.description,
    url: marketingUrl(`/use-cases/${useCase.slug}`),
    provider: { '@type': 'Organization', name: 'Nexez', url: marketingUrl('/') },
    audience: { '@type': 'BusinessAudience', name: useCase.label },
  }

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
          <div className="nx-orb nx-orb--purple !opacity-20" />
        </div>
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[0.95fr_0.75fr] lg:items-center lg:py-24">
          <div>
            <div className="eyebrow">{useCase.label}</div>
            <h1 className="mt-5 text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              {useCase.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              {useCase.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={appUrl(`/create?template=${useCase.templateId}`)} className="btn-primary h-11 px-5">
                {useCase.cta}
                <ArrowRight className="size-4" />
              </a>
              <a href="/examples" className="btn-secondary h-11 px-5">View templates</a>
            </div>
          </div>

          <div className="nx-glass-panel p-5">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Search className="size-5 text-[var(--signal)]" />
              <div>
                <p className="text-sm font-medium">Sample buyer intent</p>
                <p className="font-mono text-xs text-muted-foreground">agent.query</p>
              </div>
            </div>
            <p className="mt-5 rounded-lg border border-border bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
              {useCase.buyerIntent}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Offers to publish</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Give agents options they can compare.
            </h2>
            <div className="mt-6 grid gap-3">
              {useCase.offers.map((offer) => (
                <div key={offer} className="flex items-center gap-3 rounded-lg border border-border bg-white/[0.03] p-4">
                  <CheckCircle2 className="size-5 text-[var(--ready)]" />
                  <span className="text-sm font-medium">{offer}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">What the listing must prove</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Reduce guessing before the handoff.
            </h2>
            <div className="mt-6 grid gap-3">
              {useCase.pageMustProve.map((proof) => (
                <div key={proof} className="flex items-center gap-3 rounded-lg border border-border bg-white/[0.03] p-4">
                  <CheckCircle2 className="size-5 text-[var(--signal)]" />
                  <span className="text-sm font-medium">{proof}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white/[0.015]">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] md:text-6xl">
            Build the listing an agent can recommend with confidence.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Start with this use case, import what you already have, and tighten the listing until the buying path is obvious.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={appUrl(`/create?template=${useCase.templateId}`)} className="btn-primary h-11 px-5">
              {useCase.cta}
              <ArrowRight className="size-4" />
            </a>
            <a href="/use-cases" className="btn-secondary h-11 px-5">All use cases</a>
          </div>
        </div>
      </section>
    </main>
  )
}
