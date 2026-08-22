import type { Metadata } from 'next'
import {
  ArrowRight,
  Blocks,
  Bot,
  Braces,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Link2,
  LockKeyhole,
  Network,
  Radar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  PLATFORM_DOCS_REVIEWED_AT,
  PLATFORM_DOCS_VERSION,
  platformCapabilityCount,
  platformDocsChapters,
  platformLifecycle,
  platformPrimitives,
  platformTrustDestinations,
} from '../../lib/platform-docs'
import { agentRuntimeUrl, appUrl, marketingUrl } from '../../lib/site'

const metaTitle = 'Platform Documentation'
const metaDescription =
  'The complete Nexez platform source of truth: listings, agents, commerce, approval, analytics, finance, integrations, security, and developer contracts.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: marketingUrl('/docs') },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/docs'),
    title: metaTitle,
    description: metaDescription,
  },
}

const chapterIcons = {
  'workspace-foundation': Building2,
  authoring: Blocks,
  'readiness-publication': FileCheck2,
  'discovery-intelligence': Radar,
  commerce: CircleDollarSign,
  'analytics-finance': ChartNoAxesCombined,
  'integrations-automation': Link2,
  'buyer-agent': Bot,
  'developer-distribution': Code2,
  'security-operations': ShieldCheck,
} as const

const availabilityTone = {
  Core: 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
  'Plan-controlled': 'border-[var(--signal)]/30 bg-[var(--signal)]/10 text-[var(--signal)]',
  Developer: 'border-[var(--info)]/30 bg-[var(--info)]/10 text-[var(--info)]',
  'Admin-operated': 'border-border bg-white/[0.04] text-muted-foreground',
} as const

export default function PlatformDocsPage() {
  const capabilityCount = platformCapabilityCount()
  const reviewedLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${PLATFORM_DOCS_REVIEWED_AT}T00:00:00Z`))

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'The complete Nexez platform',
    description: metaDescription,
    dateModified: PLATFORM_DOCS_REVIEWED_AT,
    version: PLATFORM_DOCS_VERSION,
    mainEntityOfPage: marketingUrl('/docs'),
    publisher: { '@type': 'Organization', name: 'Nexez', url: marketingUrl('/') },
  }

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />

      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0">
          <div className="nx-grid" />
          <div className="nx-orb nx-orb--purple !opacity-20" />
          <div className="nx-orb nx-orb--teal !opacity-15" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-20 lg:py-28">
          <div className="eyebrow">Platform documentation · source of truth</div>
          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.6fr)] lg:items-end">
            <div>
              <h1 className="max-w-5xl text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-8xl">
                The complete <span className="nx-accent-text">Nexez platform.</span>
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">
                One maintained guide to what Nexez does, how the system fits together, where every capability lives,
                and which boundary applies before an agent discovers, recommends, or acts.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#platform-model" className="btn-primary h-11 px-5">
                  Read the platform model <ArrowRight className="size-4" />
                </a>
                <a href={appUrl('/create')} className="btn-secondary h-11 px-5">Build a listing</a>
              </div>
            </div>

            <div className="nx-glass-panel overflow-hidden">
              <div className="border-b border-border p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--signal)]/30 bg-[var(--signal)]/10">
                    <Fingerprint className="size-5 text-[var(--signal)]" />
                  </div>
                  <div>
                    <p className="font-medium">Current product record</p>
                    <p className="font-mono text-xs text-muted-foreground">docs.nexez.platform.v{PLATFORM_DOCS_VERSION}</p>
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-2 divide-x divide-border">
                <div className="p-5">
                  <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Capabilities</dt>
                  <dd className="mt-2 text-3xl font-semibold">{capabilityCount}</dd>
                </div>
                <div className="p-5">
                  <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Chapters</dt>
                  <dd className="mt-2 text-3xl font-semibold">{platformDocsChapters.length}</dd>
                </div>
              </dl>
              <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
                Reviewed {reviewedLabel}. Shipped behavior only—no roadmap promises.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform-model" className="scroll-mt-28 border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="text-sm font-medium text-[var(--signal)]">The platform model</p>
              <h2 className="mt-2 text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Four records. One buying truth.</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                Nexez is the governed commerce layer between a business&apos;s existing systems and the agents acting for buyers.
                These primitives keep every human page, machine artifact, approval, transaction, and report aligned.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {platformPrimitives.map((primitive, index) => (
                <article key={primitive.name} className="nx-tile p-5">
                  <div className="flex items-center justify-between">
                    <Braces className="size-5 text-[var(--signal)]" />
                    <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold">{primitive.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{primitive.definition}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <p className="text-sm font-medium text-[var(--ready)]">The transaction lifecycle</p>
          <h2 className="mt-2 max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Intent stays intact from question to record.</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
            {platformLifecycle.map(([title, copy], index) => (
              <article key={title} className="bg-background p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 font-mono text-xs text-[var(--ready)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-medium">{title}</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[250px_minmax(0,1fr)] lg:py-20">
        <aside className="hidden lg:block">
          <nav aria-label="Documentation chapters" className="sticky top-28 rounded-xl border border-border bg-background/80 p-3 backdrop-blur-xl">
            <p className="px-3 pb-3 pt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Capabilities</p>
            {platformDocsChapters.map((chapter) => (
              <a key={chapter.id} href={`#${chapter.id}`} className="flex gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground">
                <span className="font-mono text-xs text-[var(--signal)]">{chapter.number}</span>
                <span>{chapter.title}</span>
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-16">
          {platformDocsChapters.map((chapter) => {
            const Icon = chapterIcons[chapter.id as keyof typeof chapterIcons]
            return (
              <section key={chapter.id} id={chapter.id} className="scroll-mt-28">
                <div className="flex items-start gap-4 border-b border-border pb-6">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[var(--signal)]/30 bg-[var(--signal)]/10">
                    <Icon className="size-6 text-[var(--signal)]" />
                  </div>
                  <div>
                    <p className="font-mono text-xs tracking-[0.18em] text-[var(--signal)]">CHAPTER {chapter.number}</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-4xl">{chapter.title}</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">{chapter.promise}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {chapter.capabilities.map((capability) => (
                    <article key={capability.name} className="rounded-xl border border-border bg-white/[0.025] p-5 md:p-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <h3 className="text-xl font-semibold tracking-tight">{capability.name}</h3>
                        <span className={`w-fit rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${availabilityTone[capability.availability]}`}>
                          {capability.availability}
                        </span>
                      </div>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{capability.summary}</p>
                      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_0.55fr]">
                        <ul className="space-y-2">
                          {capability.details.map((detail) => (
                            <li key={detail} className="flex gap-2.5 text-sm leading-6">
                              <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--ready)]" />
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Where it lives</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {capability.surfaces.map((surface) => (
                              <span key={surface} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">{surface}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <section className="border-y border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl border border-[var(--ready)]/30 bg-[var(--ready)]/10">
                <Network className="size-5 text-[var(--ready)]" />
              </div>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] md:text-5xl">One system, three deliberate boundaries.</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                The marketing story, authenticated control plane, and public agent runtime are separated so discoverability never implies access to owner data.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['nexez.ai', 'Learn', 'Public education, discovery, simulator, Trust, and this documentation.'],
                ['app.nexez.ai', 'Control', 'Authenticated listings, settings, integrations, analytics, negotiations, and finance.'],
                ['nexez.app', 'Act', 'Published listings, storefronts, artifacts, APIs, checkout, negotiations, and buyer orders.'],
              ].map(([host, label, copy]) => (
                <article key={host} className="nx-tile p-5">
                  <p className="font-mono text-xs text-[var(--signal)]">{host}</p>
                  <h3 className="mt-4 text-xl font-semibold">{label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-[var(--signal)]">Trust library</p>
              <h2 className="mt-2 max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-5xl">Focused guides for the decisions that deserve depth.</h2>
            </div>
            <a href={agentRuntimeUrl('/openapi.json')} className="btn-secondary h-11 px-5">
              OpenAPI <ExternalLink className="size-4" />
            </a>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {platformTrustDestinations.map((destination) => (
              <a key={destination.href} href={destination.href} className="group nx-tile p-5 transition-colors hover:border-[var(--signal)]/50">
                <div className="flex items-center justify-between">
                  <LockKeyhole className="size-5 text-[var(--signal)]" />
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{destination.label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{destination.summary}</p>
              </a>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-5 border-t border-border pt-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-[var(--ready)]" /> Current capability guide</span>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/terms" className="hover:text-foreground">Terms</a>
          </div>
        </div>
      </section>
    </main>
  )
}
