import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Bot, Gauge, ArrowUpRight, BadgeCheck } from 'lucide-react'
import { getOfferCount, getReadinessScore, getCertification } from '../../../lib/agent-page'
import { loadStorefrontByHandle } from '../../../lib/server/storefront'

type PageProps = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params
  const resolved = await loadStorefrontByHandle(handle)
  if (!resolved) return { title: 'Storefront not found | Nexez' }
  const name = resolved.storefront.display_name || resolved.storefront.handle
  return {
    title: `${name} - agent storefront | Nexez`,
    description: resolved.storefront.description || `Browse ${name}'s AI-ready listings on Nexez.`,
  }
}

export default async function StorefrontPage({ params }: PageProps) {
  const { handle } = await params
  const resolved = await loadStorefrontByHandle(handle)
  // Unknown handle, or a storefront with nothing published yet → 404 (no empty public page).
  if (!resolved || resolved.listings.length === 0) notFound()

  const { storefront, listings } = resolved
  const name = storefront.display_name || storefront.handle
  const accent = storefront.accent_color || 'var(--signal)'

  // Storefront-level aggregate across its listings.
  const totalOffers = listings.reduce((sum, p) => sum + getOfferCount(p), 0)
  const avgReadiness = Math.round(listings.reduce((sum, p) => sum + getReadinessScore(p), 0) / listings.length)
  const certifiedCount = listings.filter((p) => getCertification(p).certified).length

  return (
    <main className="min-h-dvh bg-background text-white">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
        <header className="border-b border-border pb-8">
          <p className="text-sm font-medium" style={{ color: accent }}>Agent storefront</p>
          <div className="mt-3 flex items-center gap-4">
            {storefront.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storefront.logo_url} alt={`${name} logo`} className="size-14 rounded-2xl object-cover" />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-2xl bg-white/5"><Bot className="size-7" style={{ color: accent }} /></span>
            )}
            <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">{name}</h1>
          </div>
          {storefront.description ? (
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{storefront.description}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-border px-3 py-1 text-muted-foreground">{listings.length} {listings.length === 1 ? 'listing' : 'listings'}</span>
            <span className="rounded-full border border-border px-3 py-1 text-muted-foreground">{totalOffers} offers</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-muted-foreground"><Gauge className="size-3" /> {avgReadiness}% avg readiness</span>
            {certifiedCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-3 py-1 text-[var(--ready)]"><BadgeCheck className="size-3" /> Nexez Certified</span>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            <a href={`/store/${storefront.handle}/agent.json`} className="font-mono underline hover:text-white">agent.json</a>
          </p>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((page) => (
            <a key={page.id} href={`/${page.slug}`} className="nx-tile group block p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="line-clamp-1 text-lg font-medium group-hover:text-white">{page.name}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">/{page.slug}</p>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-white" />
              </div>
              <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {page.description || 'A structured offer listing built for AI agents.'}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-1">{getOfferCount(page)} offers</span>
                {page.location ? <span className="rounded-full border border-border px-2 py-1">{page.location}</span> : null}
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                  <Gauge className="size-3" /> {getReadinessScore(page)}% ready
                </span>
              </div>
            </a>
          ))}
        </section>
      </div>
    </main>
  )
}
