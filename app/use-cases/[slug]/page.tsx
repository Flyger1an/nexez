import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight, CheckCircle2, Search } from 'lucide-react'
import { appUrl, marketingUrl } from '../../../lib/site'
import { getUseCase, useCases } from '../../../lib/marketing-content'
import { getUseCaseCommerceStory } from '../../../lib/use-case-commerce-story'
import { safeJsonScript } from '../../../lib/safe-json'

type UseCaseProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return useCases.map((useCase) => ({ slug: useCase.slug }))
}

export async function generateMetadata({ params }: UseCaseProps): Promise<Metadata> {
  const { slug } = await params
  const useCase = getUseCase(slug)
  const story = getUseCaseCommerceStory(slug)
  if (!useCase || !story) return {}

  return {
    title: `${useCase.label} - Sell Through AI on Your Terms`,
    description: story.description,
    alternates: {
      canonical: marketingUrl(`/use-cases/${useCase.slug}`),
    },
    openGraph: {
      type: 'website',
      siteName: 'Nexez',
      url: marketingUrl(`/use-cases/${useCase.slug}`),
      title: `${useCase.label} - Sell Through AI on Your Terms`,
      description: story.description,
    },
  }
}

export default async function UseCaseDetailPage({ params }: UseCaseProps) {
  const { slug } = await params
  const useCase = getUseCase(slug)
  const story = getUseCaseCommerceStory(slug)
  if (!useCase || !story) notFound()

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: `Nexez for ${useCase.label.toLowerCase()}`,
        description: story.description,
        url: marketingUrl(`/use-cases/${useCase.slug}`),
        provider: { '@type': 'Organization', name: 'Nexez', url: marketingUrl('/') },
        audience: { '@type': 'BusinessAudience', name: useCase.label },
      },
      {
        '@type': 'FAQPage',
        mainEntity: story.faq.map((item) => ({
          '@type': 'Question',
          name: item.title,
          acceptedAnswer: { '@type': 'Answer', text: item.copy },
        })),
      },
    ],
  }

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonScript(structuredData) }}
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
              {story.headline}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              {story.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={appUrl(`/create?template=${useCase.templateId}`)} className="btn-primary h-11 px-5">
                {useCase.cta}
                <ArrowRight className="size-4" />
              </a>
              <a href="/how-it-works" className="btn-secondary h-11 px-5">See how Nexez works</a>
            </div>
          </div>

          <div className="nx-glass-panel p-5">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Search className="size-5 text-[var(--signal)]" />
              <div>
                <p className="text-sm font-medium">A buyer might ask</p>
                <p className="text-xs text-muted-foreground">In their own words</p>
              </div>
            </div>
            <p className="mt-5 rounded-lg border border-border bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
              “{story.buyerRequest}”
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:py-16">
          <p className="text-sm font-medium text-muted-foreground">Where Nexez helps</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.045em] md:text-4xl">
            AI can understand the request. It should not invent your business rules.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
            {story.problem}
          </p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:py-20 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">You stay in control of</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              The way your business actually sells.
            </h2>
            <div className="mt-6 grid gap-3">
              {story.merchantControls.map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 shrink-0 text-[var(--ready)]" />
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <p className="mt-2 pl-8 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Nexez handles</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              The buying details between the request and the next step.
            </h2>
            <div className="mt-6 grid gap-3">
              {story.nexezHandles.map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 shrink-0 text-[var(--signal)]" />
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <p className="mt-2 pl-8 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center md:py-20">
          <p className="text-sm font-medium text-muted-foreground">What the buyer gets</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
            A clear answer without taking control away from you.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
            {story.outcome}
          </p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <p className="text-sm font-medium text-muted-foreground">Common questions</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
            Asked by {useCase.label.toLowerCase()} like you.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {story.faq.map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-white/[0.02] p-5">
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white/[0.015]">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] md:text-6xl">
            Let AI help sell your service without making the rules for you.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Start with what you already sell. Add the buyer details, prices, and rules your business actually needs.
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
