import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, CircleHelp, ShieldCheck } from 'lucide-react'
import {
  commerceExamplePath,
  getPublicCommerceExample,
  getPublicCommerceExamples,
} from '../../../lib/commerce-templates/public'
import { appUrl, marketingUrl } from '../../../lib/site'

type CommerceExamplePageProps = {
  params: Promise<{ templateId: string }>
}

function humanize(value: string) {
  return value.replace(/[-_]/g, ' ')
}

export function generateStaticParams() {
  return getPublicCommerceExamples().map((example) => ({ templateId: example.id }))
}

export async function generateMetadata({ params }: CommerceExamplePageProps): Promise<Metadata> {
  const { templateId } = await params
  const example = getPublicCommerceExample(templateId)
  if (!example) return {}

  const title = `${example.title.replace(' — Nexez Example', '')} Template Example`
  return {
    title,
    description: example.description,
    alternates: { canonical: marketingUrl(commerceExamplePath(example.id)) },
    openGraph: {
      type: 'website',
      siteName: 'Nexez',
      url: marketingUrl(commerceExamplePath(example.id)),
      title,
      description: example.description,
    },
  }
}

export default async function CommerceExamplePage({ params }: CommerceExamplePageProps) {
  const { templateId } = await params
  const example = getPublicCommerceExample(templateId)
  if (!example) notFound()

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
          <div className="nx-orb nx-orb--amber !opacity-20" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-5 py-16 md:py-20">
          <a href="/examples" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            All examples
          </a>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_0.72fr] lg:items-start">
            <div>
              <div className="eyebrow">Nexez Example · {example.industry}</div>
              <h1 className="mt-5 max-w-4xl text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl">
                {example.title.replace(' — Nexez Example', '')}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">{example.description}</p>

              <div className="mt-6 rounded-xl border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--amber)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--amber)]">Reference template — not live supply</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{example.disclaimer}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href={appUrl(`/create?commerceTemplate=${encodeURIComponent(example.id)}`)} className="btn-primary h-11 px-5">
                  Build your version
                  <ArrowRight className="size-4" />
                </a>
                <a href="/examples" className="btn-secondary h-11 px-5">Browse all examples</a>
              </div>
            </div>

            <div className="nx-glass-panel p-5">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Commerce pattern</p>
              <p className="mt-2 text-xl font-medium capitalize">{humanize(example.archetype)}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {example.capabilityTags.map((capability) => (
                  <span key={capability} className="rounded-full border border-border bg-white/[0.03] px-2.5 py-1 text-xs text-muted-foreground">
                    {humanize(capability)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 md:py-16">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-[var(--ready)]">Example offer structure</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">What an agent could reason about</h2>
              <div className="mt-6 space-y-3">
                {example.offers.map((offer) => (
                  <div key={offer.name} className="nx-tile p-5">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--ready)]" />
                      <div>
                        <h3 className="font-medium">{offer.name}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{offer.description}</p>
                        {offer.priceSignal ? <p className="mt-2 font-mono text-xs text-muted-foreground">Demo price signal: {offer.priceSignal}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-[var(--signal)]">Customer intent</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Try asking Nexez</h2>
              <div className="mt-6 space-y-3">
                {example.tryAsking.map((prompt) => (
                  <div key={prompt} className="rounded-xl border border-[var(--signal)]/20 bg-[var(--signal)]/5 p-4">
                    <div className="flex items-start gap-3">
                      <Bot className="mt-0.5 size-5 shrink-0 text-[var(--signal)]" />
                      <p className="text-sm leading-6 text-muted-foreground">“{prompt}”</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:py-16">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-[var(--amber)]">Merchant truth boundary</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">What Nexie would clarify before publishing</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              These are questions the template teaches Nexez to investigate. They are not assumptions about any real business.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {example.clarifications.map((clarification) => (
              <div key={clarification.key} className="nx-tile p-5">
                <div className="flex items-start gap-3">
                  <CircleHelp className="mt-0.5 size-5 shrink-0 text-[var(--amber)]" />
                  <div>
                    <h3 className="font-medium">{clarification.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-foreground">{clarification.question}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{clarification.why}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-border bg-black/20 p-5">
            <p className="text-sm font-medium">Customer job</p>
            <ul className="mt-3 space-y-2">
              {example.customerJobs.map((job) => (
                <li key={job} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--ready)]" />
                  {job}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  )
}
