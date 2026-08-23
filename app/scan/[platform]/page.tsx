import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight, ScanSearch } from 'lucide-react'
import { getScanPlatform, scanPlatforms } from '../../../lib/scan-platforms'
import { marketingUrl } from '../../../lib/site'
import { safeJsonScript } from '../../../lib/safe-json'

// Programmatic "Is my {platform} site AI-agent ready?" landing pages. Content +
// platform-specific fix path around a CTA into the real scanner at /scan - the
// scanner itself stays one canonical interactive surface.

type PlatformProps = { params: Promise<{ platform: string }> }

export function generateStaticParams() {
  return scanPlatforms.map((p) => ({ platform: p.slug }))
}

export async function generateMetadata({ params }: PlatformProps): Promise<Metadata> {
  const { platform } = await params
  const p = getScanPlatform(platform)
  if (!p) return {}
  return {
    title: p.metaTitle,
    description: p.metaDescription,
    alternates: {
      canonical: marketingUrl(`/scan/${p.slug}`),
    },
    // Page-level openGraph replaces the layout's wholesale (shallow merge) - re-carry type/siteName.
    openGraph: {
      type: 'website',
      siteName: 'Nexez',
      url: marketingUrl(`/scan/${p.slug}`),
      title: p.metaTitle,
      description: p.metaDescription,
    },
  }
}

export default async function ScanPlatformPage({ params }: PlatformProps) {
  const { platform } = await params
  const p = getScanPlatform(platform)
  if (!p) notFound()

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
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
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 py-16 md:py-20">
          <p className="text-sm font-medium" style={{ color: 'var(--signal)' }}>
            Free scan · {p.name}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] md:text-5xl" style={{ textWrap: 'balance' }}>
            Is your {p.name} site AI-agent ready?
          </h1>
          <p className="mt-4 text-muted-foreground">
            AI shopping agents read your site very differently from your visitors. See exactly what they can - and cannot -
            understand about your {p.name} site, in seconds, free.
          </p>
          <a href="/scan" className="btn-primary mt-7 inline-flex items-center gap-2">
            <ScanSearch className="size-4" /> Scan your {p.name} site
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12 md:py-16">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">How agents see a typical {p.name} site</h2>
        <div className="mt-4 space-y-4">
          {p.reality.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="leading-7 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="mt-6 rounded-lg border border-[var(--amber)]/35 bg-[var(--amber)]/[0.07] p-4">
          <p className="text-sm leading-6 text-muted-foreground">{p.constraint}</p>
        </div>

        <h2 className="mt-12 text-2xl font-semibold tracking-[-0.03em]">The fix path for {p.name}</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-6 leading-7 text-muted-foreground">
          {p.fixSteps.map((step) => (
            <li key={step.slice(0, 40)}>{step}</li>
          ))}
        </ol>

        <div className="mt-10 rounded-xl border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] p-5">
          <p className="font-semibold">Start with the scan - it takes seconds.</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            You&rsquo;ll get a per-check breakdown: structured offers, pricing, buyer actions, agent artifacts, and crawler
            access - scored the way agents actually probe.
          </p>
          <a href="/scan" className="btn-primary btn-sm mt-4 inline-flex items-center gap-1.5">
            Run the free scan <ArrowRight className="size-3.5" />
          </a>
        </div>

        <h2 className="mt-12 text-2xl font-semibold tracking-[-0.03em]">Frequently asked questions</h2>
        <div className="mt-5 space-y-4">
          {p.faqs.map((faq) => (
            <div key={faq.question} className="rounded-lg border border-border bg-white/[0.02] p-4">
              <h3 className="font-medium">{faq.question}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Deeper reading:{' '}
          <a href="/learn/ai-agents-book-service-businesses" className="underline decoration-[var(--signal)]/50 underline-offset-2">
            how agents find, compare, and book businesses
          </a>{' '}
          and{' '}
          <a href="/learn/what-is-llms-txt" className="underline decoration-[var(--signal)]/50 underline-offset-2">
            the honest take on llms.txt
          </a>
          .
        </p>
      </section>
    </main>
  )
}
