import type { Metadata } from 'next'
import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { ArrowLeft, ArrowUpRight, Bot, CheckCircle2, Code2, Globe2, LockKeyhole, Mail, MapPin } from 'lucide-react'
import { AgentPage, FaqItem, OfferItem, PUBLIC_PAGE_SELECT, getBaseUrl, getCheckoutOffers, getCheckoutOfferKey, getCheckoutPath, getOfferCount, getTrustScore, parseAvailabilityWindows } from '../../lib/agent-page'
import { getAgentJsonPath } from '../../lib/agent-manifest'
import { safeJsonScript } from '../../lib/safe-json'
import { logAgentPageView } from '../../lib/server/log-agent-page-view'
import { supabase } from '../../lib/supabase'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ negotiation?: string }>
}

async function getPage(slug: string) {
  const { data } = await supabase
	    .from('pages')
	    .select(PUBLIC_PAGE_SELECT)
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

export default async function AgentPageRoute({ params, searchParams }: PageProps) {
  const { slug } = await params
  const negotiationParam = (await searchParams)?.negotiation
  const page = await getPage(slug)

  if (!page) {
    notFound()
  }

  // Log the visit (agent detection + analytics) AFTER the response is sent so
  // it never adds latency to the public agent page (<200ms quality bar). The
  // request headers are captured now; `after` runs the inserts post-render.
  const requestHeaders = await headers()
  const visitUrl = `${getBaseUrl()}/${page.slug}`
  after(() => logAgentPageView({ page, requestHeaders, url: visitUrl }))

  // Live events for accurate Trust Score completion rate (attempts vs real bookings)
  let trustEvents: any[] = []
  try {
    const { data: ev } = await supabase
      .from('checkout_events')
      .select('event_type, created_at')
      .eq('slug', slug)
      .order('created_at', { ascending: false })
      .limit(15)
    trustEvents = ev || []
  } catch {}

  const products = page.products ?? []
  const services = page.services ?? []
  const faqs = page.faqs ?? []
  const negotiationOffers = getCheckoutOffers(page)
  const negotiationCreated = negotiationParam === 'created'
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
	        dangerouslySetInnerHTML={{ __html: safeJsonScript(jsonLd) }}
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

        {(page as any).mcp_enabled && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-0.5 text-xs text-emerald-300">
            MCP Ready — structured context for Model Context Protocol agents
            <a href={`/${slug}/mcp.json`} className="underline">mcp.json</a>
          </div>
        )}

        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-0.5 text-xs text-amber-300">
          Trust Score: {getTrustScore(page, trustEvents)}/100
          {(page as any).verification_details?.domain_verified && ' ✓ Verified'}
          {(page as any).verification_details?.docs_provided?.length > 0 && ' 📜 Credentials attached'}
        </div>
        {(page as any).verification_details?.docs_provided?.length > 0 && (
          <div className="mt-1 text-[10px] text-amber-400/80">Credentials: {((page as any).verification_details.docs_provided as string[]).join(' • ')}</div>
        )}

        <section className="grid gap-10 py-8 md:py-12 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div>
            <p className="font-mono text-sm text-[#00F5FF]">/{page.slug}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-1.5px] sm:text-5xl md:text-6xl lg:text-7xl">
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
              {(page as any).next_available && (
                <SummaryRow 
                  label={(page as any).google_calendar_id ? "Availability (Google Calendar)" : "Next available"} 
                  value={(page as any).next_available.split(' ||WINDOWS||')[0]} 
                />
              )}
              {(() => {
                const windows = parseAvailabilityWindows((page as any).next_available)
                if (!windows || windows.length === 0) return null
                return (
                  <div className="mt-2 rounded border border-[#7C3AED]/20 bg-[#1A1625] p-2 text-[11px]">
                    <div className="mb-1 text-cyan-400 text-[10px] font-medium">Next available slots (Google Calendar)</div>
                    <div className="grid grid-cols-1 gap-y-0.5 text-zinc-300">
                      {windows.slice(0, 4).map((w: any, idx: number) => (
                        <div key={idx}>{w.label || `${w.date} ${w.start}–${w.end}`}</div>
                      ))}
                    </div>
                  </div>
                )
              })()}
              <SummaryRow label="Primary action" value={page.cta_label || 'Visit website'} />
              {page.last_booking && (
                <SummaryRow 
                  label="Recent booking activity" 
                  value={`${page.last_booking.event_name} on ${new Date(page.last_booking.at).toLocaleDateString()}`} 
                />
              )}
            </dl>
            <div className="mt-6 card !p-4 text-sm leading-6 text-zinc-200 bg-white/[0.03]">
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

        <section className="grid grid-cols-1 gap-5 py-8 md:grid-cols-3">
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
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {faqs.map((faq: FaqItem, index) => (
                <div key={`${faq.question}-${index}`} className="card !p-5">
                  <h3 className="font-medium text-white">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {negotiationOffers.length ? (
          <section id="negotiate" className="border-t border-white/10 py-12">
            <h2 className="text-2xl font-semibold">Request a custom quote</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Buying agents and humans can propose scope, budget, and timeline. The owner reviews each
              proposal and responds. AI agents can also negotiate programmatically via{' '}
              <code className="text-zinc-300">POST /api/negotiations</code>.
            </p>

            {negotiationCreated ? (
              <p className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">
                Proposal sent — the owner has received your request and will review the terms.
              </p>
            ) : null}

            <form method="post" action="/api/negotiations" className="card mt-6 grid gap-4 !p-6 sm:grid-cols-2">
              <input type="hidden" name="slug" value={page.slug} />

              <label className="block text-sm sm:col-span-2">
                <span className="text-zinc-300">Offer</span>
                <select
                  name="offer"
                  defaultValue={getCheckoutOfferKey(negotiationOffers[0].kind, negotiationOffers[0].index)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                >
                  {negotiationOffers.map((offer) => {
                    const key = getCheckoutOfferKey(offer.kind, offer.index)
                    return (
                      <option key={key} value={key}>
                        {offer.name} {offer.price ? `— ${offer.price}` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>

              <label className="block text-sm sm:col-span-2">
                <span className="text-zinc-300">What do you need? (scope / request)</span>
                <textarea
                  name="query"
                  rows={3}
                  placeholder="Describe the work, quantity, or constraints…"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-zinc-500"
                />
              </label>

              <label className="block text-sm">
                <span className="text-zinc-300">Budget (optional)</span>
                <input
                  name="budget"
                  type="text"
                  placeholder="e.g. $500–$800"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-zinc-500"
                />
              </label>

              <label className="block text-sm">
                <span className="text-zinc-300">Timeline (optional)</span>
                <input
                  name="timeline"
                  type="text"
                  placeholder="e.g. within 2 weeks"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-zinc-500"
                />
              </label>

              <label className="block text-sm sm:col-span-2">
                <span className="text-zinc-300">Your contact (email or agent ID)</span>
                <input
                  name="contact"
                  type="text"
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-zinc-500"
                />
              </label>

              <button
                type="submit"
                className="btn-primary inline-flex min-h-[44px] items-center justify-center sm:col-span-2"
              >
                Send proposal
              </button>
            </form>
          </section>
        ) : null}

        {(page as any).agent_memory && (
          <section className="border-t border-white/10 py-8">
            <h2 className="text-xl font-semibold">Agent Memory & Context</h2>
            <div className="mt-3 text-sm text-[#9CA3AF] whitespace-pre-wrap card !p-4">
              {(page as any).agent_memory.notes || JSON.stringify((page as any).agent_memory)}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">This context is included for agents in manifests, mcp.json and simulator. Update in page Settings.</p>
          </section>
        )}

        <div className="text-[10px] text-zinc-500 mt-2">Voice agents: descriptions can be rewritten phonetic/short via AI Co-Pilot (Tier 3). See builder for "Voice (Tier 3)" option.</div>

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
].join('; ') || 'None listed'}
Negotiation API: POST ${getBaseUrl()}/api/negotiations with slug="${page.slug}", offer="services-0" or "products-0", query, requestedTerms, budget, timeline, and dryRun=true to validate.`}
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
    <div className="card !p-5">
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
          <article key={`${item.name}-${index}`} className="card !p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-medium text-white">{item.name}</h3>
              {item.price ? <p className="shrink-0 text-sm text-cyan-200">{item.price}</p> : null}
              {item.source && (
                <span className={`ml-2 text-[10px] rounded px-1.5 py-0.5 ${
                  item.source === 'stripe' ? 'bg-cyan-400/10 text-cyan-300' :
                  item.source === 'shopify' ? 'bg-purple-400/10 text-purple-300' :
                  item.source === 'square' ? 'bg-pink-400/10 text-pink-300' :
                  item.source === 'acuity' ? 'bg-orange-400/10 text-orange-300' :
                  'bg-blue-400/10 text-blue-300'
                }`}>
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
              {(() => {
                const useOriginal = (item.prefer_original_for_this ?? false) || (preferOriginal && !!item.url);
                return (
                  <a
                    href={useOriginal && item.url ? item.url : getCheckoutPath(pageSlug, kind, index)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6D28D9]"
                  >
                    {useOriginal 
                      ? (item.isMobile ? 'Book mobile visit on original site' : 'Book on original site') 
                      : 'Book Now'}
                    <LockKeyhole className="size-4" />
                  </a>
                );
              })()}
              {item.url ? (
                <a href={item.url} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-[#00F5FF] hover:bg-white/10">
                  View details
                  <ArrowUpRight className="size-4" />
                </a>
              ) : null}
            </div>
            {(item.prefer_original_for_this || (preferOriginal && item.url)) && (
              <div className="mt-2 text-[10px] text-emerald-300/80">Original site priority for this offer</div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function buildJsonLd(page: AgentPage) {
  const url = `${getBaseUrl()}/${page.slug}`
  const pagePrefer = !!page.prefer_original_site
  const offers = [
    ...(page.services ?? []).map((item, index) => ({ item, kind: 'services' as const, index })),
    ...(page.products ?? []).map((item, index) => ({ item, kind: 'products' as const, index })),
  ].map(({ item, kind, index }) => {
    const perOfferPrefer = !!item.prefer_original_for_this
    const useOriginal = perOfferPrefer || (pagePrefer && !!item.url)
    const effectiveUrl = useOriginal && item.url ? item.url : `${getBaseUrl()}${getCheckoutPath(page.slug, kind, index)}`
    return {
      '@type': 'Offer',
      name: item.name,
      description: item.description || undefined,
      price: item.price || undefined,
      url: effectiveUrl,
      potentialAction: {
        '@type': 'BuyAction',
        target: effectiveUrl,
      },
      itemOffered: {
        '@type': 'Service',
        name: item.name,
        description: item.description || undefined,
      },
    }
  })

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
/* Tier 3 stubs: Voice-optimized & agent memory/context notes for future (will extend manifests). */
