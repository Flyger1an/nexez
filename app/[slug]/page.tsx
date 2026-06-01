import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, Bot, CheckCircle2, Code2, Globe2, LockKeyhole, Mail, MapPin } from 'lucide-react'
import { AgentPage, FaqItem, OfferItem, getBaseUrl, getCheckoutPath, getOfferCount } from '../../lib/agent-page'
import { getAgentJsonPath } from '../../lib/agent-manifest'
import { supabase } from '../../lib/supabase'

type PageProps = {
  params: Promise<{ slug: string }>
}

async function getPage(slug: string) {
  const { data } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  return data
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPage(slug)

  if (!page) {
    return {}
  }

  return {
    title: `${page.name} | Nexez`,
    description: page.description ?? `${page.name} is available through an AI-readable Nexez page.`,
    alternates: {
      canonical: `${getBaseUrl()}/${page.slug}`,
      types: {
        'application/json': `${getBaseUrl()}${getAgentJsonPath(page.slug)}`,
      },
    },
    openGraph: {
      title: page.name,
      description: page.description ?? undefined,
      url: `${getBaseUrl()}/${page.slug}`,
      type: 'website',
    },
  }
}

export default async function AgentPageRoute({ params }: PageProps) {
  const { slug } = await params
  const page = await getPage(slug)

  if (!page) {
    notFound()
  }

  const products = page.products ?? []
  const services = page.services ?? []
  const faqs = page.faqs ?? []
  const ctaUrl = page.cta_url || page.website_url || '#'
  const preferOriginal = !!page.prefer_original_site
  const firstCheckoutPath = services.length && !preferOriginal
    ? getCheckoutPath(page.slug, 'services', 0)
    : products.length && !preferOriginal
      ? getCheckoutPath(page.slug, 'products', 0)
      : ''
  const jsonLd = buildJsonLd(page)

  return (
    <main className="public-agent-page min-h-screen bg-[#0A0A0F] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-white">
          <ArrowLeft className="size-4" />
          Nexez
        </a>

        {preferOriginal && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#7C3AED]/10 px-4 py-1 text-sm text-[#C4B5FD]">
            Bookings on this page link to the original website
          </div>
        )}

        <section className="grid gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div>
            <p className="font-mono text-sm text-[#00F5FF]">/{page.slug}</p>
            <h1 className="mt-4 max-w-4xl text-6xl font-semibold tracking-[-1.5px] md:text-7xl">
              {page.name}
            </h1>
            <p className="mt-6 max-w-3xl text-2xl leading-tight text-[#9CA3AF]">
              {page.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {firstCheckoutPath ? (
                <a
                  href={firstCheckoutPath}
                  className="btn-primary"
                >
                  Book Now
                  <LockKeyhole className="size-4" />
                </a>
              ) : (
                <a
                  href={ctaUrl}
                  className="btn-primary"
                >
                  {page.cta_label || (preferOriginal ? 'Visit our website to book' : 'Visit website')}
                  <ArrowUpRight className="size-4" />
                </a>
              )}
              {firstCheckoutPath && ctaUrl !== '#' ? (
                <a href={ctaUrl} className="btn-secondary">
                  {page.cta_label || 'Visit website'}
                </a>
              ) : null}
              {page.website_url ? (
                <a href={page.website_url} className="btn-secondary">
                  Main website
                </a>
              ) : null}
            </div>
          </div>

          <aside className="card border-[#7C3AED]/20 bg-[#1A1625] p-6">
            <div className="flex items-center gap-2 text-cyan-100">
              <Bot className="size-5" />
              <h2 className="font-medium">AI agent summary</h2>
            </div>
            <dl className="mt-6 space-y-4 text-sm">
              <SummaryRow label="Best for" value={page.audience || 'Buyers evaluating this offer'} />
              <SummaryRow label="Offer count" value={`${getOfferCount(page)} products or services`} />
              <SummaryRow label="Location" value={page.location || 'Available online or by request'} />
              <SummaryRow label="Primary action" value={page.cta_label || 'Visit website'} />
              {page.last_booking && (
                <SummaryRow 
                  label="Last booking via Calendly" 
                  value={`${page.last_booking.event_name} on ${new Date(page.last_booking.at).toLocaleDateString()}`} 
                />
              )}
            </dl>
            <div className="mt-6 rounded-lg bg-zinc-950/60 p-4 text-sm leading-6 text-zinc-200">
              {page.name} is a published Nexez agent page. Use this page to understand the offer,
          compare products or services, answer buyer questions, and route purchase intent to the
              provided booking or website URL.
            </div>
            <a
              href={getAgentJsonPath(page.slug)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10"
            >
              Agent JSON
              <Code2 className="size-4" />
            </a>
          </aside>
        </section>

        <section className="grid gap-5 py-8 md:grid-cols-3">
          {page.location ? (
            <InfoTile icon={<MapPin className="size-5" />} label="Service area" value={page.location} />
          ) : null}
          {page.contact_email ? (
            <InfoTile icon={<Mail className="size-5" />} label="Contact" value={page.contact_email} />
          ) : null}
          {page.audience ? (
            <InfoTile icon={<CheckCircle2 className="size-5" />} label="Buyer fit" value={page.audience} />
          ) : null}
        </section>

        <OfferSection title="Products" items={products} kind="products" pageSlug={page.slug} preferOriginal={preferOriginal} />
        <OfferSection title="Services" items={services} kind="services" pageSlug={page.slug} preferOriginal={preferOriginal} />

        {faqs.length ? (
          <section className="border-t border-white/10 py-12">
            <h2 className="text-2xl font-semibold">Questions agents can answer</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {faqs.map((faq: FaqItem, index) => (
                <div key={`${faq.question}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                  <h3 className="font-medium text-white">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="border-t border-white/10 py-12">
          <h2 className="text-2xl font-semibold">Plain-text agent context</h2>
          <pre className="mt-5 overflow-x-auto rounded-lg border border-white/10 bg-black p-5 text-sm leading-7 text-zinc-300">
{`Name: ${page.name}
URL: ${getBaseUrl()}/${page.slug}
Agent JSON: ${getBaseUrl()}${getAgentJsonPath(page.slug)}
Summary: ${page.description ?? ''}
Best-fit buyer: ${page.audience ?? ''}
Location: ${page.location ?? ''}
Website: ${page.website_url ?? ''}
Primary action: ${page.cta_label ?? 'Visit website'} -> ${ctaUrl}
Products: ${products.map((item) => item.name).join(', ') || 'None listed'}
Services: ${services.map((item) => item.name).join(', ') || 'None listed'}
Checkout URLs: ${[
  ...services.map((item, index) => `${item.name}: ${getBaseUrl()}${getCheckoutPath(page.slug, 'services', index)}`),
  ...products.map((item, index) => `${item.name}: ${getBaseUrl()}${getCheckoutPath(page.slug, 'products', index)}`),
].join('; ') || 'None listed'}`}
          </pre>
        </section>
      </div>
    </main>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-100">{value}</dd>
    </div>
  )
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="text-cyan-200">{icon}</div>
      <p className="mt-4 text-sm text-zinc-500">{label}</p>
      <p className="mt-1 font-medium text-white">{value}</p>
    </div>
  )
}

function OfferSection({
  title,
  items,
  kind,
  pageSlug,
  preferOriginal = false,
}: {
  title: string
  items: OfferItem[]
  kind: 'products' | 'services'
  pageSlug: string
  preferOriginal?: boolean
}) {
  if (!items.length) {
    return null
  }

  return (
    <section className="border-t border-white/10 py-12">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((item, index) => (
          <article key={`${item.name}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-medium text-white">{item.name}</h3>
              {item.price ? <p className="shrink-0 text-sm text-cyan-200">{item.price}</p> : null}
              {item.source && (
                <span className="ml-2 text-[10px] rounded bg-blue-400/10 px-1.5 py-0.5 text-blue-300">
                  via {item.source}
                </span>
              )}
            </div>
            {item.description ? <p className="mt-3 text-sm leading-6 text-zinc-400">{item.description}</p> : null}
            {/* Consumer service metadata - Enhanced */}
            {(item.duration || item.serviceArea || item.isMobile || item.travelFee) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {item.duration && <span className="rounded-full bg-white/5 px-2.5 py-0.5 border border-white/10 text-[#C4B5FD]">{item.duration}</span>}
                {item.serviceArea && <span className="rounded-full bg-white/5 px-2.5 py-0.5 border border-white/10">{item.serviceArea}</span>}
                {item.isMobile && <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 border border-emerald-400/30 text-emerald-300">Mobile</span>}
                {item.travelFee && <span className="rounded-full bg-white/5 px-2.5 py-0.5 border border-white/10">+ {item.travelFee} travel</span>}
              </div>
            )}

            {/* Pricing Tiers (Phase 1 A fidelity) */}
            {item.tiers && item.tiers.length > 0 && (
              <div className="mt-3 text-xs">
                <div className="uppercase tracking-widest text-[10px] text-[#C4B5FD] mb-1">Tiers</div>
                <ul className="space-y-1">
                  {item.tiers.map((t, ti) => (
                    <li key={ti} className="flex justify-between rounded bg-white/5 px-2 py-1">
                      <span>{t.name}</span>
                      <span className="text-cyan-200">{t.price}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={preferOriginal && item.url ? item.url : getCheckoutPath(pageSlug, kind, index)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6D28D9]"
              >
                {preferOriginal ? 'Book on our site' : 'Book Now'}
                <LockKeyhole className="size-4" />
              </a>
              {item.url ? (
                <a href={item.url} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-[#00F5FF] hover:bg-white/10">
                  View details
                  <ArrowUpRight className="size-4" />
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function buildJsonLd(page: AgentPage) {
  const url = `${getBaseUrl()}/${page.slug}`
  const offers = [
    ...(page.services ?? []).map((item, index) => ({ item, kind: 'services' as const, index })),
    ...(page.products ?? []).map((item, index) => ({ item, kind: 'products' as const, index })),
  ].map(({ item, kind, index }) => ({
    '@type': 'Offer',
    name: item.name,
    description: item.description || undefined,
    price: item.price || undefined,
    url: `${getBaseUrl()}${getCheckoutPath(page.slug, kind, index)}`,
    potentialAction: {
      '@type': 'BuyAction',
      target: `${getBaseUrl()}${getCheckoutPath(page.slug, kind, index)}`,
    },
    itemOffered: {
      '@type': 'Service',
      name: item.name,
      description: item.description || undefined,
    },
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.name,
    url,
    description: page.description,
    mainEntity: {
      '@type': 'Organization',
      name: page.name,
      url: page.website_url || url,
      areaServed: page.location || undefined,
      email: page.contact_email || undefined,
      makesOffer: offers,
    },
  }
}
