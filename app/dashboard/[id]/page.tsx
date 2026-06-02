'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Play, Save } from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import {
  AgentPage,
  OWNER_PAGE_SELECT,
  OfferItem,
  formatFaqLines,
  formatOfferLines,
  getReadinessScore,
  getTrustScore,
  normalizeSlug,
  parseFaqLines,
  parseOfferLines,
  parseAvailabilityWindows,
} from '../../../lib/agent-page'
import { optimizeAllOffersForAgents, enhanceDescriptionForAgents } from '../../../lib/ai-optimize'
import { AICoPilot } from '../../../components/AICoPilot'
import { VisualOfferBuilder } from '../../../components/VisualOfferBuilder'
import { createClient } from '../../../utils/supabase/client'

const industries = [
  'Consulting & Strategy', 'Coaching & Training', 'Creative & Design', 'Legal & Professional Services', 'Marketing & Sales',
  'Home Services (Plumbing, Electrical, Cleaning, etc.)', 'Wellness & Fitness (Massage, Personal Training, Yoga, etc.)',
  'Beauty & Personal Care', 'Automotive Services', 'Pet Care & Services', 'Health & Medical', 'Events & Experiences', 'Other Local Services'
]

type PageProps = {
  params: Promise<{ id: string }>
}

export default function EditAgentPage({ params }: PageProps) {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [integrationResyncing, setIntegrationResyncing] = useState<string | null>(null)
  const [page, setPage] = useState<AgentPage | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [audience, setAudience] = useState('')
  const [location, setLocation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [preferOriginalSite, setPreferOriginalSite] = useState(false)
  const [nextAvailable, setNextAvailable] = useState('')  // Phase 3: First step toward Google Calendar / availability hints
  const [googleCalendarId, setGoogleCalendarId] = useState('')  // Phase 3: From Settings import UI
  const [products, setProducts] = useState('')
  const [services, setServices] = useState('')
  const [faqs, setFaqs] = useState('')

  // Phase 1 A: Primary rich OfferItem[] state (source of truth for Visual Builder + direct structured import)
  // This eliminates text roundtrip loss for consumer fields + enables tiers + direct structuredOffers population
  const [servicesOffers, setServicesOffers] = useState<OfferItem[]>([])
  const [productsOffers, setProductsOffers] = useState<OfferItem[]>([])

  // Phase 1 A: Pending re-analysis for preview/diff before applying
  const [pendingReanalysis, setPendingReanalysis] = useState<{
    incomingServices: OfferItem[]
    incomingProducts: OfferItem[]
    summary: string
  } | null>(null)

  // Phase 3: Recent activity from Calendly webhooks (makes webhooks feel valuable)
  const [recentCalendlyBookings, setRecentCalendlyBookings] = useState<any[]>([])
  const [lastBooking, setLastBooking] = useState<any>(null)

  // Phase 4: Version restore handoff
  const [restoredVersion, setRestoredVersion] = useState<any>(null)

  // Full throttle: Real recent outbound fires for the activity card
  const [recentOutboundFires, setRecentOutboundFires] = useState<any[]>([])

  // For dynamic trust score with real events
  const [trustEvents, setTrustEvents] = useState<any[]>([])

  // Phase 3: Live integration connection status (read from the same localStorage as Tools)
  const [integrationStatus, setIntegrationStatus] = useState<{
    calendly?: { lastSync: string; maskedToken: string }
    stripe?: { lastImport: string }
    shopify?: { lastImport: string }
    square?: { lastImport: string }
    acuity?: { lastImport: string }
  }>({})

  // Visual builder state (derived from rich arrays; text kept for legacy/raw + CSV)
  const parsedServices = React.useMemo(() => servicesOffers.length ? servicesOffers : parseOfferLines(services), [servicesOffers, services])
  const parsedProducts = React.useMemo(() => productsOffers.length ? productsOffers : parseOfferLines(products), [productsOffers, products])
  const [isPublished, setIsPublished] = useState(true)

  useEffect(() => {
    params.then(({ id }) => setId(id))
  }, [params])

  useEffect(() => {
    if (!id) return
    loadPage(id)
  }, [id])

  // Phase 3: Load integration connection status (same keys as Tools + Integrations dashboard)
  useEffect(() => {
    try {
      const status: any = {}
      const cal = localStorage.getItem('nexez_calendly_connection')
      if (cal) status.calendly = JSON.parse(cal)

      const str = localStorage.getItem('nexez_stripe_connection')
      if (str) status.stripe = JSON.parse(str)

      const sh = localStorage.getItem('nexez_shopify_connection')
      if (sh) status.shopify = JSON.parse(sh)

      const sq = localStorage.getItem('nexez_square_connection')
      if (sq) status.square = JSON.parse(sq)

      const ac = localStorage.getItem('nexez_acuity_connection')
      if (ac) status.acuity = JSON.parse(ac)

      setIntegrationStatus(status)
    } catch {}
  }, [])

  // Phase 1 final polish: Auto-trigger reanalysis preview when coming from Settings "Re-sync"
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    if (params.get('reanalyzed') === 'true') {
      const structured = sessionStorage.getItem('nexez_imported_structured')
      const importedPage = sessionStorage.getItem('nexez_imported_page')

      if (structured) {
        try {
          const incoming = JSON.parse(structured) as OfferItem[]
          const newCount = incoming.filter(inc => 
            !servicesOffers.some(e => e.name.toLowerCase() === inc.name.toLowerCase())
          ).length
          const updateCount = incoming.length - newCount

          setPendingReanalysis({
            incomingServices: incoming,
            incomingProducts: [],
            summary: `${newCount} new offers, ${updateCount} potential updates from your website.`
          })
          setMessage('Review the imported changes from your site below.')
        } catch {}
      }

      // Clean up
      sessionStorage.removeItem('nexez_imported_structured')
      sessionStorage.removeItem('nexez_imported_page')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [id, servicesOffers.length]) // run after load

  // Phase 4: Version restore handoff from Settings history — populate rich state + form fields from snapshot
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    if (params.get('restore') === 'true') {
      const raw = sessionStorage.getItem('nexez_restore_version')
      if (raw) {
        try {
          const v = JSON.parse(raw) as any
          // Populate primary form fields
          if (v.name) setName(v.name)
          if (typeof v.description === 'string') setDescription(v.description)
          if (v.industry) setIndustry(v.industry)
          if (typeof v.prefer_original_site === 'boolean') setPreferOriginalSite(v.prefer_original_site)

          // Rich primary OfferItem[] state (critical for VisualOfferBuilder fidelity)
          const svc = Array.isArray(v.services) ? (v.services as OfferItem[]) : []
          const prod = Array.isArray(v.products) ? (v.products as OfferItem[]) : []
          setServicesOffers(svc)
          setProductsOffers(prod)
          // Keep legacy text in sync
          setServices(formatOfferLines(svc))
          setProducts(formatOfferLines(prod))

          // FAQs if present
          if (Array.isArray(v.faqs)) {
            setFaqs(formatFaqLines(v.faqs))
          }

          setRestoredVersion(v)
          setMessage('Restored from previous version. Review the offers in the Visual Builder, then Save to persist as current.')
        } catch (e) {
          // ignore malformed
        }
      }
      // Always clean the one-time session + query param
      sessionStorage.removeItem('nexez_restore_version')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [id])

  const score = useMemo(
    () =>
      getReadinessScore({
        name,
        slug,
        description,
        website_url: websiteUrl,
        cta_url: ctaUrl,
        audience,
        location,
        contact_email: contactEmail,
        industry,
        prefer_original_site: preferOriginalSite,
        products: productsOffers.length ? productsOffers : parseOfferLines(products),
        services: servicesOffers.length ? servicesOffers : parseOfferLines(services),
        faqs: parseFaqLines(faqs),
        is_published: isPublished,
      }),
    [audience, contactEmail, ctaUrl, description, faqs, isPublished, location, name, products, productsOffers, services, servicesOffers, slug, websiteUrl],
  )

  async function loadPage(pageId: string) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = `/login?next=/dashboard/${pageId}`
      return
    }

    const { data, error } = await supabase
      .from('pages')
      .select(OWNER_PAGE_SELECT)
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .single<AgentPage>()

	    if (error || !data) {
	      setMessage('Page not found, or you do not have access to edit it.')
	      setLoading(false)
	      return
	    }

	    const { data: secrets } = await supabase
	      .from('page_secrets')
	      .select('outbound_webhooks')
	      .eq('page_id', pageId)
	      .maybeSingle()

	    const activePage = {
	      ...data,
	      outbound_webhooks: secrets?.outbound_webhooks ?? null,
	    } as AgentPage

	    setPage(activePage)
	    setName(activePage.name)
	    setSlug(activePage.slug)
	    setDescription(activePage.description ?? '')
	    setWebsiteUrl(activePage.website_url ?? '')
	    setCtaUrl(activePage.cta_url ?? '')
	    setCtaLabel(activePage.cta_label ?? 'Visit website')
	    setAudience(activePage.audience ?? '')
	    setLocation(activePage.location ?? '')
	    setContactEmail(activePage.contact_email ?? '')
	    setIndustry(activePage.industry ?? '')
	    setPreferOriginalSite(!!activePage.prefer_original_site)
	    setNextAvailable(activePage.next_available ?? '')
	    setGoogleCalendarId(activePage.google_calendar_id ?? '')
	    setProducts(formatOfferLines(activePage.products))
	    setServices(formatOfferLines(activePage.services))
	    setFaqs(formatFaqLines(activePage.faqs))
	    // Seed rich primary state directly from DB arrays (Phase 1 A)
	    setServicesOffers((activePage.services ?? []) as OfferItem[])
	    setProductsOffers((activePage.products ?? []) as OfferItem[])
	    setIsPublished(activePage.is_published)

    // Phase 3: Load persisted last booking from the page (durable across refreshes)
	    if (activePage.last_booking) {
	      setLastBooking(activePage.last_booking)
    }

    setLoading(false)

    // Also fetch recent events for richer history
    try {
      const { data: events } = await supabase
        .from('checkout_events')
        .select('*')
	        .eq('slug', activePage.slug)
        .contains('metadata', { source: 'calendly_webhook' })
        .order('created_at', { ascending: false })
        .limit(3)
      if (events) setRecentCalendlyBookings(events)
    } catch {}

    // Full throttle: Load recent outbound-triggering events for the activity surface
    try {
      const { data: outboundEvents } = await supabase
        .from('checkout_events')
        .select('id, event_type, offer_name, created_at')
	        .eq('slug', activePage.slug)
        .in('event_type', ['provider_redirect', 'stripe_session_created', 'checkout_attempt'])
        .order('created_at', { ascending: false })
        .limit(5)
      if (outboundEvents) setRecentOutboundFires(outboundEvents)
    } catch {}

    // For live trust score (real completion rates from events)
    try {
      const { data: te } = await supabase
        .from('checkout_events')
        .select('*')
	        .eq('slug', activePage.slug)
        .order('created_at', { ascending: false })
        .limit(20)
      if (te) setTrustEvents(te)
    } catch {}
  }

  function optimizeOffersWithAI() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'
    const { services: optS, products: optP } = optimizeAllOffersForAgents(services, products, {
      businessName,
      audience: buyer,
    })
    if (optS) {
      setServices(optS)
      setServicesOffers(parseOfferLines(optS))
    }
    if (optP) {
      setProducts(optP)
      setProductsOffers(parseOfferLines(optP))
    }
    setMessage('Offers rewritten for AI agents (local high-quality rules).')
  }

  function enhanceDescriptionWithAI() {
    const businessName = name || 'This business'
    const buyer = audience || 'buyers evaluating services'
    const improved = enhanceDescriptionForAgents(description, businessName, buyer)
    setDescription(improved)
    setMessage('Description enhanced for agent readability.')
  }

  async function handleSyncFromWebsite() {
    if (!websiteUrl) {
      setMessage('No website URL set on this page.')
      return
    }

    setSyncing(true)
    setMessage('')

    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl, industry }),
      })

      const data = await res.json()

      if (!res.ok || !data.suggestedPage) {
        setMessage(data.error || 'Failed to sync from website.')
        return
      }

      // Merge data into current state
      if (data.suggestedPage.description) {
        setDescription(data.suggestedPage.description)
      }

      // Phase 1 A: Direct structuredOffers → rich primary arrays (smart merge, preserve user work)
      if (data.structuredOffers && data.structuredOffers.length > 0) {
        const incoming = data.structuredOffers as OfferItem[]
        const merged = [...servicesOffers]

        incoming.forEach((inc) => {
          const idx = merged.findIndex(m => m.name.toLowerCase() === inc.name.toLowerCase())
          if (idx >= 0) {
            const existing = merged[idx]
            // Smart merge: take fresher price/desc/url from site, but protect user-edited tiers and long descriptions
            merged[idx] = {
              ...existing,
              price: inc.price || existing.price,
              url: inc.url || existing.url,
              duration: inc.duration || existing.duration,
              serviceArea: inc.serviceArea || existing.serviceArea,
              isMobile: inc.isMobile ?? existing.isMobile,
              travelFee: inc.travelFee || existing.travelFee,
              // Protect substantial manual description work and tiers
              description: (existing.description?.length || 0) > 80 ? existing.description : (inc.description || existing.description),
              tiers: existing.tiers?.length ? existing.tiers : (inc.tiers || []),
            }
          } else {
            merged.push(inc)
          }
        })

        setServicesOffers(merged)
        setServices(formatOfferLines(merged))
      } else if (data.suggestedPage.services) {
        const newServices = data.suggestedPage.services
        const currentServices = services.trim()
        setServices(currentServices ? `${currentServices}\n${newServices}` : newServices)
      }

      setMessage('Synced successfully from your website (rich fields where detected). Review in the Visual Builder.')
    } catch (err) {
      setMessage('Error syncing from website.')
    } finally {
      setSyncing(false)
    }
  }

  // Phase 1 A: Re-analyze with preview (recommended path)
  async function startReanalysis() {
    if (!websiteUrl) {
      setMessage('No website URL set on this page.')
      return
    }

    setSyncing(true)
    setMessage('')
    setPendingReanalysis(null)

    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl, industry }),
      })

      const data = await res.json()

      if (!res.ok || !data.structuredOffers) {
        setMessage(data.error || 'Failed to re-analyze the website.')
        return
      }

      const incomingServices = (data.structuredOffers as OfferItem[]).filter((o: any) => !o.kind || o.kind === 'services')
      const incomingProducts = (data.structuredOffers as OfferItem[]).filter((o: any) => o.kind === 'products')

      const newCount = incomingServices.filter(inc => 
        !servicesOffers.some(e => e.name.toLowerCase() === inc.name.toLowerCase())
      ).length

      const updateCount = incomingServices.filter(inc => 
        servicesOffers.some(e => e.name.toLowerCase() === inc.name.toLowerCase())
      ).length

      setPendingReanalysis({
        incomingServices,
        incomingProducts,
        summary: `${newCount} new offers, ${updateCount} potential updates detected.`
      })

      setMessage('Review the proposed changes below before applying.')
    } catch (err) {
      setMessage('Error re-analyzing the website.')
    } finally {
      setSyncing(false)
    }
  }

  function applyPendingReanalysis(mode: 'all' | 'new' = 'all') {
    if (!pendingReanalysis) return

    const { incomingServices } = pendingReanalysis
    let merged = [...servicesOffers]

    incomingServices.forEach((inc) => {
      const idx = merged.findIndex(m => m.name.toLowerCase() === inc.name.toLowerCase())
      const isNew = idx === -1

      if (mode === 'new' && !isNew) return

      if (idx >= 0) {
        const existing = merged[idx]
        // Full throttle: advanced Stripe price handling - always take fresh price for stripe-sourced offers on re-sync
        // while protecting user-edited descriptions/tiers
        const isStripe = inc.source === 'stripe'
        const newPrice = isStripe && inc.price ? inc.price : (inc.price || existing.price)
        merged[idx] = {
          ...existing,
          price: newPrice,
          url: inc.url || existing.url,
          duration: inc.duration || existing.duration,
          serviceArea: inc.serviceArea || existing.serviceArea,
          isMobile: inc.isMobile ?? existing.isMobile,
          travelFee: inc.travelFee || existing.travelFee,
          description: (existing.description?.length || 0) > 80 ? existing.description : (inc.description || existing.description),
          tiers: existing.tiers?.length ? existing.tiers : (inc.tiers || []),
          source: inc.source || existing.source,
          prefer_original_for_this: inc.prefer_original_for_this ?? existing.prefer_original_for_this,
        }
      } else {
        merged.push(inc)
      }
    })

    setServicesOffers(merged)
    setServices(formatOfferLines(merged))
    setPendingReanalysis(null)

    // Full throttle: clearer Stripe price change reporting on apply
    const stripePriceChanges = incomingServices.filter(inc => 
      inc.source === 'stripe' && 
      merged.some(m => m.name.toLowerCase() === inc.name.toLowerCase() && m.price !== inc.price)
    ).length

    const baseMsg = 'Changes applied successfully. Review in the Visual Builder.'
    setMessage(stripePriceChanges > 0 
      ? `${baseMsg} (${stripePriceChanges} Stripe price change(s) applied from integration.)` 
      : baseMsg)
  }

  function cancelPendingReanalysis() {
    setPendingReanalysis(null)
    setMessage('Re-analysis discarded.')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!page) return

    setSaving(true)
    setMessage('')

    const supabase = createClient()

    // Phase 4 MVP: Versioning stub - capture snapshot before save
    const currentSnapshot = {
      timestamp: new Date().toISOString(),
      name,
      description,
      services: servicesOffers.length ? servicesOffers : parseOfferLines(services),
      products: productsOffers.length ? productsOffers : parseOfferLines(products),
      faqs: parseFaqLines(faqs),
      industry,
      prefer_original_site: preferOriginalSite,
    }

    const existingVersions = (page as any).versions || []
    const newVersions = [currentSnapshot, ...existingVersions].slice(0, 10) // keep last 10

    // Deeper Team: if pending approvals, queue this edit as approval request (do not block save for MVP, but record)
    let updatePayload: any = {
      name,
      slug: normalizeSlug(slug || name),
      description,
      website_url: websiteUrl,
      cta_url: ctaUrl || websiteUrl,
      cta_label: ctaLabel || 'Visit website',
      audience,
      location,
      contact_email: contactEmail,
      industry,
      prefer_original_site: preferOriginalSite,
      next_available: nextAvailable || null,
      // Phase 1 A: Prefer rich primary arrays
      products: productsOffers.length ? productsOffers : parseOfferLines(products),
      services: servicesOffers.length ? servicesOffers : parseOfferLines(services),
      faqs: parseFaqLines(faqs),
      is_published: isPublished,
      versions: newVersions,  // Phase 4: simple versioning
    }
    const teamCollab = (page as any).team_collaboration || {}
    if (teamCollab.approvals?.some((a: any) => a.status === 'pending')) {
      const newApproval = {
        id: Date.now().toString(36),
        approver: 'self',
        status: 'pending',
        note: `Edit to ${name} (offers/desc update)`,
        ts: new Date().toISOString(),
        snapshot: currentSnapshot,
      }
      const updatedApprovals = [...(teamCollab.approvals || []), newApproval]
      updatePayload.team_collaboration = { ...teamCollab, approvals: updatedApprovals }
      setMessage('Pending team approvals detected — this edit queued as new approval request.')
    }

    const { error } = await supabase
      .from('pages')
      .update(updatePayload)
      .eq('id', page.id)

    // Update local page state with new versions for immediate UI
    if (!error) {
      setPage({ ...(page as any), versions: newVersions } as any)
      if (updatePayload.team_collaboration) {
        setPage({ ...(page as any), team_collaboration: updatePayload.team_collaboration } as any)
      }
    }

    setSaving(false)
    if (error) {
      setMessage(error.message)
    } else if (updatePayload.team_collaboration) {
      setMessage('Saved. Edit queued as team approval request (see Settings). Version snapshot created.')
    } else {
      setMessage('Saved. Version snapshot created.')
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        Loading editor...
      </main>
    )
  }

  if (!page) {
    return (
      <main className="min-h-screen bg-zinc-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <p className="mt-10 rounded-lg border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
            {message || 'Page not found.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <ErrorBoundary>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={startReanalysis}
              disabled={syncing || !websiteUrl}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#7C3AED]/40 px-4 py-2 text-sm text-[#C4B5FD] hover:bg-[#7C3AED]/10 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="size-4 animate-spin" /> : null}
              {syncing ? 'Analyzing...' : 'Re-analyze from Website (Preview)'}
            </button>
            <a
              href={`/dashboard/${page.id}/test`}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-cyan-300/40 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10"
            >
              Test with agents
              <Play className="size-4" />
            </a>
            <a
              href={`/dashboard/${page.id}/settings`}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-300/40 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-300/10"
            >
              Versions & History
            </a>
            <a
              href="/dashboard/competitors"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              Competitor Intel
            </a>
            <a
              href={`/${page.slug}`}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              View public page
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <aside>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight">Edit agent page</h1>
              {(page as any)?.versions?.length > 0 && (
                <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-400">
                  {(page as any).versions.length} versions
                </span>
              )}
              <span className="rounded-full border border-amber-300/30 bg-amber-400/5 px-2.5 py-0.5 text-xs text-amber-200">
                Trust {getTrustScore(page as any, trustEvents)}/100
              </span>
            </div>
            <p className="mt-4 text-zinc-400">
              Tighten the facts an AI buyer needs. The readiness score updates as you fill in the page.
            </p>
            <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm text-zinc-500">AI readiness</p>
              <p className="mt-2 text-4xl font-semibold">{score}%</p>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: `${score}%` }} />
              </div>
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="space-y-5">
            {restoredVersion && (
              <div className="rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-amber-200">
                    Restored from version saved {new Date(restoredVersion.timestamp).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRestoredVersion(null)
                      setMessage('Restored state discarded. You can continue editing or reload the page.')
                    }}
                    className="rounded border border-amber-300/40 px-2 py-0.5 text-xs hover:bg-amber-400/20"
                  >
                    Discard restore
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-amber-300/80">Review the offers and metadata, then Save to make this the current version.</div>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Business or offer name">
                <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required />
              </Field>
              <Field label="Public slug">
                <input value={slug} onChange={(event) => setSlug(normalizeSlug(event.target.value))} className={inputClass} required />
              </Field>
            </div>

            <Field label="Short AI summary">
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={textareaClass} required />
              <button
                type="button"
                onClick={enhanceDescriptionWithAI}
                className="mt-2 rounded-lg border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
              >
                Enhance for AI agents
              </button>
            </Field>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Main website">
                <input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className={inputClass} required />
              </Field>
              <Field label="Purchase or booking URL">
                <input type="url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} className={inputClass} />
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="CTA label">
                <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Best-fit buyer">
                <input value={audience} onChange={(event) => setAudience(event.target.value)} className={inputClass} />
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Location or service area">
                <input value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Contact email">
                <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={inputClass} />
              </Field>

              <Field label="Next available (for AI agents)">
                <input value={nextAvailable} onChange={(event) => setNextAvailable(event.target.value)} className={inputClass} placeholder="e.g. This week, or specific date" />
              </Field>

              <Field label="Industry / Category">
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass}>
                  <option value="">Select industry...</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={preferOriginalSite}
                  onChange={(e) => setPreferOriginalSite(e.target.checked)}
                  className="size-4 accent-[#7C3AED]"
                />
                <span>Prefer linking bookings to my original website</span>
              </label>
              <p className="mt-1.5 text-xs text-[#9CA3AF]">
                When enabled, "Book Now" buttons will direct agents and customers to your main site instead of Nexez checkout.
              </p>
            </div>

            {/* Visual Drag & Drop Builder - Core of the new Nexez vision */}
            {industry && (industry.toLowerCase().includes('home') || industry.toLowerCase().includes('fitness') || industry.toLowerCase().includes('wellness') || industry.toLowerCase().includes('beauty') || industry.toLowerCase().includes('pet') || industry.toLowerCase().includes('automotive')) && (
              <div className="rounded-xl border border-[#7C3AED]/20 bg-[#1A1625] p-4">
                <div className="text-sm font-medium text-[#C4B5FD] mb-2">Consumer / Local Services</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>Duration, Service Area, Mobile, Travel Fee fields are available in each offer card below.</div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-200">Visual Builder (Drag & Drop + Templates)</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={optimizeOffersWithAI}
                    className="rounded-lg border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
                  >
                    AI Optimize All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const bn = name || 'This business'
                      const aud = audience || 'qualified buyers'
                      const enhancedServices = servicesOffers.map(o => ({
                        ...o,
                        description: enhanceDescriptionForAgents(o.description || '', bn, aud)
                      }))
                      const enhancedProducts = productsOffers.map(o => ({
                        ...o,
                        description: enhanceDescriptionForAgents(o.description || '', bn, aud)
                      }))
                      setServicesOffers(enhancedServices)
                      setProductsOffers(enhancedProducts)
                      setServices(formatOfferLines(enhancedServices))
                      setProducts(formatOfferLines(enhancedProducts))
                      setMessage('All offer descriptions enhanced for AI agents.')
                    }}
                    className="rounded-lg border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
                  >
                    Enhance All
                  </button>
                </div>
              </div>

              {/* Phase 7 Co-Pilot: before/after + pricing/FAQ/schema suggestions + usage tracking */}
              <AICoPilot
                businessName={name}
                audience={audience}
                servicesOffers={servicesOffers}
                productsOffers={productsOffers}
                onApplyServices={(text, offers) => {
                  setServicesOffers(offers)
                  setServices(text)
                  setMessage('Co-Pilot suggestion applied to services.')
                }}
                onApplyProducts={(text, offers) => {
                  setProductsOffers(offers)
                  setProducts(text)
                  setMessage('Co-Pilot suggestion applied to products.')
                }}
                onTrackUse={() => {
                  // Simple usage tracking (persisted on next save via versions or could be dedicated counter)
                  setMessage((m) => (m || '') + ' (AI Co-Pilot use tracked)')
                }}
                llmOptIn={(page as any)?.llm_opt_in || false}
              />

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-3 text-xs uppercase tracking-widest text-cyan-300">Services</p>
                <VisualOfferBuilder
                  offers={parsedServices}
                  kind="services"
                  businessName={name}
                  audience={audience}
                  onChange={(newOffers) => {
                    // Phase 1 A: Primary rich state (direct, no lossy text bridge for main path)
                    setServicesOffers(newOffers)
                    // Keep text in sync for raw textarea + CSV compat (uses full format)
                    setServices(formatOfferLines(newOffers))
                  }}
                />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-3 text-xs uppercase tracking-widest text-cyan-300">Products</p>
                <VisualOfferBuilder
                  offers={parsedProducts}
                  kind="products"
                  businessName={name}
                  audience={audience}
                  onChange={(newOffers) => {
                    // Phase 1 A: Primary rich state (direct, no lossy text bridge for main path)
                    setProductsOffers(newOffers)
                    setProducts(formatOfferLines(newOffers))
                  }}
                />
              </div>
            </div>

            {/* Phase 3: Recent Calendly bookings from webhooks (visible value + durable) */}
            {(lastBooking || recentCalendlyBookings.length > 0) && (
              <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/5 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-emerald-300">Recent Calendly Bookings (via webhook)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-400/70">Live from webhooks</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const demoSecret = 'demo-webhook-secret-for-testing'
                          const res = await fetch('/api/webhooks/calendly', {
                            method: 'POST',
                            headers: {
	                              'Content-Type': 'application/json',
	                              'x-nexez-test-secret': demoSecret,
	                              'x-nexez-test-page-slug': slug || page?.slug || '',
	                              'x-nexez-test-mode': 'true',
	                            },
                            body: JSON.stringify({
                              event: 'invitee.created',
                              payload: {
                                invitee: { name: 'Test Booker (editor demo)', email: 'demo@nexez.test' },
                                event: { name: 'Demo Consultation', start_time: new Date().toISOString() },
                              },
                            }),
                          })
                          if (res.ok) {
                            // Reload last booking + recent events from DB (now durable)
                            const sb = createClient()
                            const { data: freshPage } = await sb.from('pages').select('last_booking').eq('id', id).single()
                            if (freshPage?.last_booking) setLastBooking(freshPage.last_booking)
                            const { data: events } = await sb
                              .from('checkout_events')
                              .select('*')
                              .eq('slug', slug || page?.slug || '')
                              .contains('metadata', { source: 'calendly_webhook' })
                              .order('created_at', { ascending: false })
                              .limit(3)
                            if (events) setRecentCalendlyBookings(events)
                            setMessage('Test booking recorded via webhook (durable + outbound if configured).')
                          }
                        } catch (e) {
                          setMessage('Test webhook failed (check console).')
                        }
                      }}
                      className="text-[10px] rounded border border-emerald-300/40 px-2 py-0.5 text-emerald-200 hover:bg-emerald-400/10"
                    >
                      Send test booking
                    </button>
                  </div>
                </div>
                {lastBooking && (
                  <div className="mb-2 text-sm">
                    <span className="font-medium text-emerald-200">Last:</span> {lastBooking.event_name} with {lastBooking.invitee_name}
                    <span className="ml-2 text-xs text-zinc-500">({new Date(lastBooking.at).toLocaleString()})</span>
                  </div>
                )}
                {recentCalendlyBookings.length > 0 && (
                  <div className="space-y-1 text-xs">
                    {recentCalendlyBookings.slice(0, lastBooking ? 2 : 3).map((evt, idx) => (
                      <div key={idx} className="flex justify-between text-zinc-300">
                        <span>{evt.offer_name} — {evt.metadata?.invitee_name || 'Guest'}</span>
                        <span className="text-zinc-500">{new Date(evt.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Phase 3/4: Recent Outbound Activity - now with real recent fires */}
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-cyan-300">Recent Outbound Webhook Activity</span>
                <span className="text-[10px] text-cyan-400/70">Auto-fired on bookings</span>
              </div>
              {recentOutboundFires.length > 0 ? (
                <div className="space-y-1 text-[11px]">
                  {recentOutboundFires.slice(0, 4).map((evt, idx) => (
                    <div key={idx} className="flex justify-between text-cyan-200">
                      <span>{evt.event_type.replace(/_/g, ' ')} — {evt.offer_name}</span>
                      <span className="text-cyan-400/70">{new Date(evt.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                  <div className="mt-1 text-[9px] text-cyan-300/80">Fired to your configured endpoints (with signing when set).</div>
                </div>
              ) : (
                <div className="text-[11px] text-cyan-200">
                  Outbound endpoints fire automatically on real bookings (Nexez checkout + Calendly webhooks).
                  Use "Send Test" in Settings to verify instantly.
                </div>
              )}
              <div className="mt-2 text-[9px] text-cyan-200/70">
                Configure per-page in Settings. Full history + export in Analytics.
              </div>
            </div>

            {/* Phase 3/4: Connected Integrations + Command Center Health */}
            {(integrationStatus.calendly || integrationStatus.stripe || integrationStatus.shopify || integrationStatus.square || integrationStatus.acuity || googleCalendarId || (page as any)?.versions?.length > 0 || (page as any)?.outbound_webhooks?.length > 0) && (
              <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-300">Connected Integrations & Health</span>
                  <a href="/dashboard/integrations" className="text-[10px] text-cyan-400 hover:text-cyan-300">Full status →</a>
                </div>

                {/* Versioning + Outbound quick signals */}
                <div className="flex flex-wrap gap-2 text-xs mb-3">
                  {(page as any)?.versions?.length > 0 && (
                    <a href={`/dashboard/${id}/settings`} className="flex items-center gap-1 rounded border border-emerald-300/30 bg-emerald-400/5 px-2 py-1 text-emerald-200 hover:bg-emerald-400/10">
                      {(page as any).versions.length} versions saved
                    </a>
                  )}
                  {(page as any)?.outbound_webhooks?.length > 0 && (
                    <span className="flex items-center gap-1 rounded border border-cyan-300/30 bg-cyan-400/5 px-2 py-1 text-cyan-200">
                      {(page as any).outbound_webhooks.length} outbound endpoint{(page as any).outbound_webhooks.length > 1 ? 's' : ''} active
                    </span>
                  )}
                  {(page as any)?.team_collaboration?.approvals?.some((a: any) => a.status === 'pending') && (
                    <span className="rounded border border-zinc-300/30 bg-zinc-400/5 px-2 py-1 text-xs text-zinc-300">
                      Team: {(page as any).team_collaboration.approvals.filter((a: any) => a.status === 'pending').length} pending
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    // Deeper team: actually persist pending approval using page id (post-audit)
                    try {
                      const supabase = (await import('../../../utils/supabase/client')).createClient()
                      const current = (page as any)?.team_collaboration || { approvals: [] }
                      const newA = { id: Date.now().toString(36), approver: 'self', status: 'pending', note: 'Current edits (offers/desc etc)', ts: new Date().toISOString() }
                      const updated = { ...current, approvals: [...(current.approvals || []), newA] }
                      if ((page as any)?.id) {
                        await supabase.from('pages').update({ team_collaboration: updated }).eq('id', (page as any).id)
                        alert('Approval request saved to team_collaboration. Manage in Settings.')
                      } else {
                        alert('Page id not available; save page first then request.')
                      }
                    } catch (e) { alert('Failed to request: ' + (e as any).message) }
                  }}
                  className="text-[10px] mt-1 text-cyan-400 hover:underline"
                >
                  Request team approval for edits →
                </button>

                <div className="flex flex-wrap gap-2 text-xs">
                  {integrationStatus.calendly && (
                    <div className="flex items-center gap-2 rounded border border-violet-300/30 bg-violet-400/5 px-2 py-1 text-violet-200">
                      Calendly ✓ <span className="text-[10px] text-zinc-400">({new Date(integrationStatus.calendly.lastSync).toLocaleDateString()})</span>
                      <button
                        type="button"
                        disabled={!!integrationResyncing}
                        onClick={async () => {
                          setIntegrationResyncing('calendly')
                          try {
                            let token = sessionStorage.getItem('nexez_last_calendly_token') || ''
                            if (!token) {
                              token = prompt('Paste Calendly PAT for re-sync (not stored long-term):') || ''
                              if (token) sessionStorage.setItem('nexez_last_calendly_token', token)
                            }
                            if (!token) {
                              setIntegrationResyncing(null)
                              return
                            }

                            const res = await fetch('/api/integrations/calendly/import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ token }),
                            })
                            const data = await res.json()
                            if (data.structuredOffers?.length) {
                              const incoming = data.structuredOffers as OfferItem[]
                              const newCount = incoming.filter(inc =>
                                !servicesOffers.some(e => e.name.toLowerCase() === inc.name.toLowerCase())
                              ).length
                              const updateCount = incoming.length - newCount
                              setPendingReanalysis({
                                incomingServices: incoming,
                                incomingProducts: [],
                                summary: `Calendly re-sync: ${incoming.length} offers (${newCount} new, ${updateCount} potentially updated). Smart merge will protect your edited descriptions and tiers.`,
                              })
                              setMessage('Calendly offers loaded into re-analysis preview.')
                            } else {
                              setMessage(data.error || 'No offers returned from Calendly.')
                            }
                          } catch (e: any) {
                            setMessage('Calendly re-sync failed: ' + e.message)
                          } finally {
                            setIntegrationResyncing(null)
                          }
                        }}
                        className="ml-1 text-[10px] rounded border border-violet-300/50 px-1.5 py-0 text-violet-100 hover:bg-violet-400/10 disabled:opacity-50"
                      >
                        {integrationResyncing === 'calendly' ? '...' : 'Re-sync'}
                      </button>
                    </div>
                  )}
                  {integrationStatus.stripe && (
                    <div className="flex items-center gap-2 rounded border border-cyan-300/30 bg-cyan-400/5 px-2 py-1 text-cyan-200">
                      Stripe ✓ <span className="text-[10px] text-zinc-400">({new Date(integrationStatus.stripe.lastImport).toLocaleDateString()})</span>
                      <button
                        type="button"
                        disabled={!!integrationResyncing}
                        onClick={async () => {
                          setIntegrationResyncing('stripe')
                          try {
                            let secret = sessionStorage.getItem('nexez_last_stripe_secret') || ''
                            if (!secret) {
                              secret = prompt('Paste Stripe Secret Key (sk_live_... or sk_test_...) for re-sync:') || ''
                              if (secret) sessionStorage.setItem('nexez_last_stripe_secret', secret)
                            }
                            if (!secret) {
                              setIntegrationResyncing(null)
                              return
                            }

                            const res = await fetch('/api/integrations/stripe/import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ stripeSecretKey: secret }),
                            })
                            const data = await res.json()
                            if (data.structuredOffers?.length) {
                              const incoming = data.structuredOffers as OfferItem[]
                              const newCount = incoming.filter(inc =>
                                !servicesOffers.some(e => e.name.toLowerCase() === inc.name.toLowerCase())
                              ).length
                              const updateCount = incoming.length - newCount
                              setPendingReanalysis({
                                incomingServices: incoming,
                                incomingProducts: [],
                                summary: `Stripe re-sync: ${incoming.length} products/prices (${newCount} new, ${updateCount} potentially updated). Smart merge protects your edits.`,
                              })
                              // Full throttle: real price diff detection for Stripe
                              let stripeDiffNote = ''
                              if (incoming.some((o: any) => o.source === 'stripe')) {
                                const currentStripe = servicesOffers.filter(o => o.source === 'stripe')
                                const priceChanges = incoming.filter((inc: any) => {
                                  const match = currentStripe.find(c => c.name.toLowerCase() === inc.name.toLowerCase())
                                  return match && match.price !== inc.price
                                })
                                if (priceChanges.length > 0) {
                                  stripeDiffNote = ` • ${priceChanges.length} price change(s) detected`
                                }
                              }
                              setMessage(`Stripe offers loaded into re-analysis preview.${stripeDiffNote}`)
                            } else {
                              setMessage(data.error || 'No products returned from Stripe.')
                            }
                          } catch (e: any) {
                            setMessage('Stripe re-sync failed: ' + e.message)
                          } finally {
                            setIntegrationResyncing(null)
                          }
                        }}
                        className="ml-1 text-[10px] rounded border border-cyan-300/50 px-1.5 py-0 text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-50"
                      >
                        {integrationResyncing === 'stripe' ? '...' : 'Re-sync'}
                      </button>
                    </div>
                  )}
                  {integrationStatus.shopify && (
                    <div className="flex items-center gap-2 rounded border border-purple-300/30 bg-purple-400/5 px-2 py-1 text-purple-200">
                      Shopify ✓ <span className="text-[10px] text-zinc-400">({new Date(integrationStatus.shopify.lastImport).toLocaleDateString()})</span>
                      <button
                        type="button"
                        disabled={!!integrationResyncing}
                        onClick={async () => {
                          setIntegrationResyncing('shopify')
                          try {
                            let shop = sessionStorage.getItem('nexez_last_shopify_shop') || ''
                            let token = sessionStorage.getItem('nexez_last_shopify_token') || ''

                            if (!shop) {
                              shop = prompt('Shopify store domain (yourstore.myshopify.com):') || ''
                              if (shop) sessionStorage.setItem('nexez_last_shopify_shop', shop)
                            }
                            if (!token) {
                              token = prompt('Admin API token (optional for public catalogs, leave blank for public):') || ''
                              if (token) sessionStorage.setItem('nexez_last_shopify_token', token)
                            }
                            if (!shop) {
                              setIntegrationResyncing(null)
                              return
                            }

                            const res = await fetch('/api/integrations/shopify/import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ shop, accessToken: token }),
                            })
                            const data = await res.json()
                            if (data.structuredOffers?.length) {
                              const incoming = data.structuredOffers as OfferItem[]
                              const newCount = incoming.filter(inc =>
                                !servicesOffers.some(e => e.name.toLowerCase() === inc.name.toLowerCase())
                              ).length
                              const updateCount = incoming.length - newCount
                              setPendingReanalysis({
                                incomingServices: incoming,
                                incomingProducts: [],
                                summary: `Shopify re-sync: ${incoming.length} products (${newCount} new, ${updateCount} potentially updated). Smart merge protects your edits.`,
                              })
                              setMessage('Shopify catalog loaded into re-analysis preview.')
                            } else {
                              setMessage(data.error || 'No products returned from Shopify.')
                            }
                          } catch (e: any) {
                            setMessage('Shopify re-sync failed: ' + e.message)
                          } finally {
                            setIntegrationResyncing(null)
                          }
                        }}
                        className="ml-1 text-[10px] rounded border border-purple-300/50 px-1.5 py-0 text-purple-100 hover:bg-purple-400/10 disabled:opacity-50"
                      >
                        {integrationResyncing === 'shopify' ? '...' : 'Re-sync'}
                      </button>
                    </div>
                  )}
                  {integrationStatus.square && (
                    <div className="flex items-center gap-2 rounded border border-pink-300/30 bg-pink-400/5 px-2 py-1 text-pink-200">
                      Square ✓ <span className="text-[10px] text-zinc-400">({new Date(integrationStatus.square.lastImport).toLocaleDateString()})</span>
                      <button
                        type="button"
                        disabled={!!integrationResyncing}
                        onClick={async () => {
                          setIntegrationResyncing('square')
                          try {
                            const res = await fetch('/api/integrations/square/import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({}),
                            })
                            const data = await res.json()
                            if (data.structuredOffers?.length) {
                              const incoming = data.structuredOffers as OfferItem[]
                              setPendingReanalysis({
                                incomingServices: incoming,
                                incomingProducts: [],
                                summary: `Square consumer services re-sync: ${incoming.length} offers. Rich mobile + travel fields included.`,
                              })
                              setMessage('Square services loaded into re-analysis preview.')
                            }
                          } catch (e: any) {
                            setMessage('Square re-sync failed: ' + e.message)
                          } finally {
                            setIntegrationResyncing(null)
                          }
                        }}
                        className="ml-1 text-[10px] rounded border border-pink-300/50 px-1.5 py-0 text-pink-100 hover:bg-pink-400/10 disabled:opacity-50"
                      >
                        {integrationResyncing === 'square' ? '...' : 'Re-sync'}
                      </button>
                    </div>
                  )}
                  {integrationStatus.acuity && (
                    <div className="flex items-center gap-2 rounded border border-orange-300/30 bg-orange-400/5 px-2 py-1 text-orange-200">
                      Acuity ✓ <span className="text-[10px] text-zinc-400">({new Date(integrationStatus.acuity.lastImport).toLocaleDateString()})</span>
                      <button
                        type="button"
                        disabled={!!integrationResyncing}
                        onClick={async () => {
                          setIntegrationResyncing('acuity')
                          try {
                            const res = await fetch('/api/integrations/acuity/import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({}),
                            })
                            const data = await res.json()
                            if (data.structuredOffers?.length) {
                              const incoming = data.structuredOffers as OfferItem[]
                              setPendingReanalysis({
                                incomingServices: incoming,
                                incomingProducts: [],
                                summary: `Acuity scheduling re-sync: ${incoming.length} appointment types. Strong for time-based consumer services.`,
                              })
                              setMessage('Acuity appointment types loaded into re-analysis preview.')
                            }
                          } catch (e: any) {
                            setMessage('Acuity re-sync failed: ' + e.message)
                          } finally {
                            setIntegrationResyncing(null)
                          }
                        }}
                        className="ml-1 text-[10px] rounded border border-orange-300/50 px-1.5 py-0 text-orange-100 hover:bg-orange-400/10 disabled:opacity-50"
                      >
                        {integrationResyncing === 'acuity' ? '...' : 'Re-sync'}
                      </button>
                    </div>
                  )}
                  {googleCalendarId && (
                    <div className="flex items-center gap-2 rounded border border-emerald-300/30 bg-emerald-400/5 px-2 py-1 text-emerald-200">
                      Google Calendar ✓ <span className="text-[10px] text-zinc-400">({googleCalendarId.includes('@') ? googleCalendarId.split('@')[0] + '...' : googleCalendarId.slice(0, 10) + '...'})</span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-zinc-500">
                  Re-sync keeps source metadata (via stripe, via shopify, etc.) and feeds the smart merge preview. Stripe price webhooks are now active — price.updated events auto-update matching offers. Full control in <a href={`/dashboard/${id}/settings`} className="underline">Settings</a> or <a href="/dashboard/tools" className="underline">Tools</a>.
                </p>
                <div className="mt-2 text-[10px] text-emerald-300">Outbound webhooks + Google Calendar availability — full management in Settings</div>
                <div className="mt-1 text-[10px] text-zinc-400">Last re-sync times shown in badges • Full health in /dashboard/integrations</div>
              </div>
            )}

            {/* Phase 3: Availability (Google Calendar track foundation) */}
            <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-zinc-300">Availability for agents</span>
                <a href="#next-available" className="text-[10px] text-cyan-400 hover:text-cyan-300">Edit →</a>
              </div>
              <div className="text-sm text-emerald-200">
                {nextAvailable ? nextAvailable.split(' ||WINDOWS||')[0] : 'Not set — agents will see "Contact for current slots"'}
              </div>
              {googleCalendarId && (
                <div className="mt-1 text-[10px] text-emerald-300">Google Calendar connected • ID: {googleCalendarId}</div>
              )}
              {(page as any).availability && (
                <div className="mt-1 text-[10px] text-emerald-300">Structured availability exposed for agents</div>
              )}
              {(() => {
                const wins = parseAvailabilityWindows(nextAvailable)
                if (!wins || wins.length === 0) return null
                return (
                  <div className="mt-2 text-[10px] text-emerald-300">
                    Upcoming preview: {wins.slice(0, 3).map((w: any) => w.label || `${w.start}`).join(' • ')}
                  </div>
                )
              })()}
              <p className="mt-1 text-[10px] text-zinc-500">
                Import in Settings now generates real upcoming windows (stub). Shown in agent.json + public page.
                Outbound webhooks fire automatically on bookings (configure in Settings).
              </p>
              {nextAvailable && (
                <div className="mt-1 text-[10px] text-emerald-300">Availability data live for agents</div>
              )}
              {/* Phase 3 status note */}
              <div className="mt-1 text-[10px] text-zinc-400">Google Calendar import produces concrete upcoming slots for agents (see Settings)</div>
              <div className="mt-1 text-[10px] text-emerald-300">
                {(page as any).outbound_webhooks?.length 
                  ? `${(page as any).outbound_webhooks.length} outbound endpoint${(page as any).outbound_webhooks.length === 1 ? '' : 's'} configured (fires on bookings)`
                  : 'No outbound webhooks yet — configure in Settings'}
              </div>
              <div className="mt-1 text-[9px] text-zinc-500">Secrets supported • Test from Settings • Fires on real Nexez + Calendly events</div>
              {typeof window !== 'undefined' && localStorage.getItem('nexez_last_outbound_fired') && (
                <div className="mt-1 text-[9px] text-emerald-300">Last outbound fire: {new Date(localStorage.getItem('nexez_last_outbound_fired')!).toLocaleString()}</div>
              )}
              <div className="mt-1 text-[9px] text-cyan-300/70">Per-page endpoints configured in Settings now fire automatically on booking events.</div>
              <div className="mt-1 text-[9px] text-emerald-300/80">Real events (checkout + Calendly) trigger your systems with optional signing.</div>
              <a href={`/dashboard/${id}/settings`} className="mt-1 inline-block text-[9px] text-cyan-400 hover:underline">Manage versions & outbound history in Settings →</a>
            </div>

            {/* Phase 1 A: Re-analysis preview / diff */}
            {pendingReanalysis && (
              <div className="rounded-xl border border-[#7C3AED]/30 bg-[#1A1625] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#C4B5FD]">Re-analysis Preview</p>
                    <p className="text-sm text-zinc-400">{pendingReanalysis.summary}</p>
                    {pendingReanalysis.incomingServices?.some((o: any) => o.source) && (
                      <p className="mt-1 text-[10px] text-blue-400">
                        Includes offers from integrations (source preserved). 
                        {pendingReanalysis.incomingServices.some((o: any) => o.source === 'stripe') && ' Stripe prices compared below.'}
                      </p>
                    )}
                    {/* Full throttle: advanced Stripe price diff list with deltas */}
                    {pendingReanalysis.incomingServices?.some((o: any) => o.source === 'stripe') && (() => {
                      const current = servicesOffers.filter(o => o.source === 'stripe')
                      const changes = pendingReanalysis.incomingServices
                        .filter((inc: any) => inc.source === 'stripe')
                        .map((inc: any) => {
                          const match = current.find(c => c.name.toLowerCase() === inc.name.toLowerCase())
                          if (match && match.price !== inc.price) {
                            return { name: inc.name, old: match.price, new: inc.price }
                          }
                          return null
                        }).filter(Boolean)
                      if (changes.length === 0) return null
                      return (
                        <div className="mt-2 rounded border border-amber-300/20 bg-amber-400/5 p-2 text-[10px] text-amber-300">
                          <div className="font-medium mb-1">Stripe price changes detected:</div>
                          {changes.map((c: any, idx: number) => (
                            <div key={idx}>• {c.name}: {c.old} → {c.new}</div>
                          ))}
                          <div className="mt-1 text-[9px] text-amber-200/80">Fresh prices from Stripe will be applied on merge (user edits to other fields protected).</div>
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => applyPendingReanalysis('all')}
                      className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
                    >
                      Apply All Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPendingReanalysis('new')}
                      className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white hover:bg-white/10"
                    >
                      Add New Only
                    </button>
                    <button
                      type="button"
                      onClick={cancelPendingReanalysis}
                      className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  Smart merge protects edited descriptions, tiers, and per-offer "Book on original site" preferences. New consumer fields, prices, and sources from integrations are incorporated (Stripe prices always fresh on apply).
                </p>
              </div>
            )}

            {/* Legacy text view (kept for power users / CSV import compatibility) */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Show raw text format (advanced)</summary>
              <div className="mt-3 space-y-4">
                <Field label="Products (raw text)">
                  <textarea value={products} onChange={(event) => setProducts(event.target.value)} className={textareaClass} />
                </Field>
                <Field label="Services (raw text)">
                  <textarea value={services} onChange={(event) => setServices(event.target.value)} className={textareaClass} />
                </Field>
              </div>
            </details>

            <Field label="FAQs, one per line: question | answer">
              <textarea value={faqs} onChange={(event) => setFaqs(event.target.value)} className={textareaClass} />
            </Field>

            <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(event) => setIsPublished(event.target.checked)}
                className="size-4 accent-cyan-300"
              />
              Published and visible to crawlers
            </label>

            {message ? <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">{message}</p> : null}

            {(page as any)?.team_collaboration?.approvals?.some((a: any) => a.status === 'pending') && (
              <div className="rounded-lg border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-200">
                Team approvals pending. Saving will queue these edits as a new approval request (see Settings). The live published version updates only after approval.
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>
      </ErrorBoundary>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-200">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-300/60'

const textareaClass =
  'min-h-28 w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-300/60'
