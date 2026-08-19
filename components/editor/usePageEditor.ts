'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AgentPage,
  OfferItem,
  formatFaqLines,
  formatOfferLines,
  getReadinessScore,
  parseFaqLines,
  parseOfferLines,
} from '../../lib/agent-page'
import {
  smartMergeOffers,
  countOfferChanges,
  buildSavePayload,
  buildDraftContent,
  type EditorSaveInput,
} from '../../lib/editor-merge'
import { draftToLiveUpdate } from '../../lib/draft'
import { publishErrorMessage } from '../../lib/publish-error'
import { optimizeAllOffersForAgents, enhanceDescriptionForAgents } from '../../lib/ai-optimize'
import { mergeOfferCollectionPreservingConfiguration } from '../../lib/configured-offer'
import { createClient } from '../../utils/supabase/client'
import { EditorEvent, EditorInitial, IntegrationStatus, PendingReanalysis, ResyncProvider } from './types'

const RESYNC_LABELS: Record<ResyncProvider, string> = {
  calendly: 'Calendly',
  stripe: 'Stripe',
  shopify: 'Shopify',
  square: 'Square',
  acuity: 'Acuity',
}

/**
 * Owns all editor state, derived values, and handlers. Seeded synchronously
 * from server-fetched `initial` (no client load waterfall). The save / draft /
 * re-analysis logic delegates to the pure, unit-tested helpers in
 * `lib/editor-merge.ts`.
 */
export function usePageEditor(initial: EditorInitial) {
  const id = initial.page.id as string

  const [page, setPage] = useState<AgentPage>(initial.page)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [integrationResyncing, setIntegrationResyncing] = useState<string | null>(null)

  const [name, setName] = useState(initial.page.name ?? '')
  const [slug, setSlug] = useState(initial.page.slug ?? '')
  const [description, setDescription] = useState(initial.page.description ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(initial.page.website_url ?? '')
  const [ctaUrl, setCtaUrl] = useState(initial.page.cta_url ?? '')
  const [ctaLabel, setCtaLabel] = useState(initial.page.cta_label ?? 'Visit website')
  const [audience, setAudience] = useState(initial.page.audience ?? '')
  const [location, setLocation] = useState(initial.page.location ?? '')
  const [contactEmail, setContactEmail] = useState(initial.page.contact_email ?? '')
  const [industry, setIndustry] = useState(initial.page.industry ?? '')
  const [preferOriginalSite, setPreferOriginalSite] = useState(!!initial.page.prefer_original_site)
  const [nextAvailable, setNextAvailable] = useState((initial.page as any).next_available ?? '')
  const [googleCalendarId] = useState((initial.page as any).google_calendar_id ?? '')
  const [products, setProducts] = useState(formatOfferLines(initial.page.products))
  const [services, setServices] = useState(formatOfferLines(initial.page.services))
  const [faqs, setFaqs] = useState(formatFaqLines(initial.page.faqs))
  const [servicesOffers, setServicesOffers] = useState<OfferItem[]>((initial.page.services ?? []) as OfferItem[])
  const [productsOffers, setProductsOffers] = useState<OfferItem[]>((initial.page.products ?? []) as OfferItem[])
  const [isPublished, setIsPublished] = useState(initial.page.is_published)

  const [pendingReanalysis, setPendingReanalysis] = useState<PendingReanalysis | null>(null)
  const [restoredVersion, setRestoredVersion] = useState<any>(null)

  const [recentCalendlyBookings, setRecentCalendlyBookings] = useState<EditorEvent[]>(initial.recentCalendlyBookings)
  const [lastBooking, setLastBooking] = useState<any>((initial.page as any).last_booking ?? null)
  const [recentOutboundFires] = useState<EditorEvent[]>(initial.recentOutboundFires)
  const [trustEvents] = useState<EditorEvent[]>(initial.trustEvents)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({})

  const parsedServices = useMemo(
    () => (servicesOffers.length ? servicesOffers : parseOfferLines(services)),
    [servicesOffers, services],
  )
  const parsedProducts = useMemo(
    () => (productsOffers.length ? productsOffers : parseOfferLines(products)),
    [productsOffers, products],
  )

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
    [
      audience,
      contactEmail,
      ctaUrl,
      description,
      faqs,
      industry,
      isPublished,
      location,
      name,
      preferOriginalSite,
      products,
      productsOffers,
      services,
      servicesOffers,
      slug,
      websiteUrl,
    ],
  )

  // Snapshot of the offer-bearing + save state for the pure helpers.
  const saveInput = (): EditorSaveInput => ({
    name,
    slug,
    description,
    websiteUrl,
    ctaUrl,
    ctaLabel,
    audience,
    location,
    contactEmail,
    industry,
    preferOriginalSite,
    nextAvailable,
    isPublished,
    services,
    products,
    faqs,
    servicesOffers,
    productsOffers,
  })

  // Load integration connection status (same keys as Tools + Integrations dashboard).
  useEffect(() => {
    try {
      const status: IntegrationStatus = {}
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

  // Arrival from the create wizard after publishing a new page. The public
  // page opens separately; the creator lands here to keep working.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('created') !== '1') return

    const publicSlug = url.searchParams.get('public')
    setMessage(publicSlug
      ? `Listing published. The public listing opened in a new tab. If your browser blocked it, use "View public listing" here.`
      : 'Listing published. Continue editing here, or use "View public listing" to inspect the live listing.')

    url.searchParams.delete('created')
    url.searchParams.delete('public')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  // Auto-trigger reanalysis preview when arriving from Settings "Re-sync".
  useEffect(() => {
    if (typeof window === 'undefined') return
    const search = new URLSearchParams(window.location.search)
    if (search.get('reanalyzed') === 'true') {
      const structured = sessionStorage.getItem('nexez_imported_structured')
      if (structured) {
        try {
          const incoming = JSON.parse(structured) as OfferItem[]
          const { newCount, updateCount } = countOfferChanges(servicesOffers, incoming)
          setPendingReanalysis({
            incomingServices: incoming,
            incomingProducts: [],
            summary: `${newCount} new offers, ${updateCount} potential updates from your website.`,
          })
          setMessage('Review the imported changes from your site below.')
        } catch {}
      }
      sessionStorage.removeItem('nexez_imported_structured')
      sessionStorage.removeItem('nexez_imported_page')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [id, servicesOffers.length])

  // Version restore handoff from Settings history - populate state from snapshot.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const search = new URLSearchParams(window.location.search)
    if (search.get('restore') === 'true') {
      const raw = sessionStorage.getItem('nexez_restore_version')
      if (raw) {
        try {
          const v = JSON.parse(raw) as any
          if (v.name) setName(v.name)
          if (typeof v.description === 'string') setDescription(v.description)
          if (v.industry) setIndustry(v.industry)
          if (typeof v.prefer_original_site === 'boolean') setPreferOriginalSite(v.prefer_original_site)
          const svc = Array.isArray(v.services) ? (v.services as OfferItem[]) : []
          const prod = Array.isArray(v.products) ? (v.products as OfferItem[]) : []
          setServicesOffers(svc)
          setProductsOffers(prod)
          setServices(formatOfferLines(svc))
          setProducts(formatOfferLines(prod))
          if (Array.isArray(v.faqs)) setFaqs(formatFaqLines(v.faqs))
          setRestoredVersion(v)
          setMessage('Restored from previous version. Review the offers in the Visual Builder, then Save to persist as current.')
        } catch {}
      }
      sessionStorage.removeItem('nexez_restore_version')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [id])

  function optimizeOffersWithAI() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'
    const { services: optS, products: optP } = optimizeAllOffersForAgents(services, products, {
      businessName,
      audience: buyer,
    })
    if (optS) {
      setServices(optS)
      setServicesOffers(mergeOfferCollectionPreservingConfiguration(servicesOffers, parseOfferLines(optS)))
    }
    if (optP) {
      setProducts(optP)
      setProductsOffers(mergeOfferCollectionPreservingConfiguration(productsOffers, parseOfferLines(optP)))
    }
    setMessage('Offers rewritten for AI agents (local high-quality rules).')
  }

  function enhanceDescriptionWithAI() {
    const businessName = name || 'This business'
    const buyer = audience || 'buyers evaluating services'
    setDescription(enhanceDescriptionForAgents(description, businessName, buyer))
    setMessage('Description enhanced for agent readability.')
  }

  function enhanceAllOffers() {
    const bn = name || 'This business'
    const aud = audience || 'qualified buyers'
    const enhancedServices = servicesOffers.map((o) => ({
      ...o,
      description: enhanceDescriptionForAgents(o.description || '', bn, aud),
    }))
    const enhancedProducts = productsOffers.map((o) => ({
      ...o,
      description: enhanceDescriptionForAgents(o.description || '', bn, aud),
    }))
    setServicesOffers(enhancedServices)
    setProductsOffers(enhancedProducts)
    setServices(formatOfferLines(enhancedServices))
    setProducts(formatOfferLines(enhancedProducts))
    setMessage('All offer descriptions enhanced for AI agents.')
  }

  async function handleSyncFromWebsite() {
    if (!websiteUrl) {
      setMessage('No website URL set on this listing.')
      return
    }
    setSyncing(true)
    setMessage('')
    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl, industry, pageId: page.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.suggestedPage) {
        setMessage(data.error || 'Failed to sync from website.')
        return
      }
      if (data.suggestedPage.description) setDescription(data.suggestedPage.description)

      if (data.structuredOffers && data.structuredOffers.length > 0) {
        const merged = smartMergeOffers(servicesOffers, data.structuredOffers as OfferItem[], 'all')
        setServicesOffers(merged)
        setServices(formatOfferLines(merged))
      } else if (data.suggestedPage.services) {
        const newServices = data.suggestedPage.services
        const currentServices = services.trim()
        setServices(currentServices ? `${currentServices}\n${newServices}` : newServices)
      }
      setMessage('Synced successfully from your website (rich fields where detected). Review in the Visual Builder.')
    } catch {
      setMessage('Error syncing from website.')
    } finally {
      setSyncing(false)
    }
  }

  async function startReanalysis() {
    if (!websiteUrl) {
      setMessage('No website URL set on this listing.')
      return
    }
    setSyncing(true)
    setMessage('')
    setPendingReanalysis(null)
    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl, industry, pageId: page.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.structuredOffers) {
        setMessage(data.error || 'Failed to re-analyze the website.')
        return
      }
      const incomingServices = (data.structuredOffers as OfferItem[]).filter((o: any) => !o.kind || o.kind === 'services')
      const incomingProducts = (data.structuredOffers as OfferItem[]).filter((o: any) => o.kind === 'products')
      const { newCount, updateCount } = countOfferChanges(servicesOffers, incomingServices)
      setPendingReanalysis({
        incomingServices,
        incomingProducts,
        summary: `${newCount} new offers, ${updateCount} potential updates detected.`,
      })
      setMessage('Review the proposed changes below before applying.')
    } catch {
      setMessage('Error re-analyzing the website.')
    } finally {
      setSyncing(false)
    }
  }

  function applyPendingReanalysis(mode: 'all' | 'new' = 'all') {
    if (!pendingReanalysis) return
    const { incomingServices } = pendingReanalysis
    const merged = smartMergeOffers(servicesOffers, incomingServices, mode)
    setServicesOffers(merged)
    setServices(formatOfferLines(merged))
    setPendingReanalysis(null)

    // Stripe-sourced prices are already fresh in `merged`, so this count is
    // effectively 0 - preserved from the original for behavioral parity.
    const stripePriceChanges = incomingServices.filter(
      (inc) =>
        inc.source === 'stripe' &&
        merged.some((m) => m.name.toLowerCase() === inc.name.toLowerCase() && m.price !== inc.price),
    ).length
    const baseMsg = 'Changes applied successfully. Review in the Visual Builder.'
    setMessage(
      stripePriceChanges > 0
        ? `${baseMsg} (${stripePriceChanges} Stripe price change(s) applied from integration.)`
        : baseMsg,
    )
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

    const { payload, versions, snapshot } = buildSavePayload(saveInput(), (page as any).versions || [])
    const updatePayload: any = { ...payload }

    const teamCollab = (page as any).team_collaboration || {}
    if (teamCollab.approvals?.some((a: any) => a.status === 'pending')) {
      const newApproval = {
        id: Date.now().toString(36),
        approver: 'self',
        status: 'pending',
        note: `Edit to ${name} (offers/desc update)`,
        ts: new Date().toISOString(),
        snapshot,
      }
      updatePayload.team_collaboration = { ...teamCollab, approvals: [...(teamCollab.approvals || []), newApproval] }
      setMessage('Pending team approvals detected - this edit queued as new approval request.')
    }

    const { error } = await supabase.from('pages').update(updatePayload).eq('id', page.id)
    if (!error) {
      setPage(
        (prev) =>
          ({
            ...(prev as any),
            versions,
            ...(updatePayload.team_collaboration ? { team_collaboration: updatePayload.team_collaboration } : {}),
          }) as AgentPage,
      )
    }
    setSaving(false)
    if (error) {
      setMessage(publishErrorMessage(error))
    } else if (updatePayload.team_collaboration) {
      setMessage('Saved. Edit queued as team approval request (see Settings). Version snapshot created.')
    } else {
      setMessage('Saved. Version snapshot created.')
    }
  }

  async function handleSaveDraft() {
    if (!page) return
    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const draft = buildDraftContent(saveInput())
    const draftUpdatedAt = new Date().toISOString()
    const { error } = await supabase.from('pages').update({ draft, draft_updated_at: draftUpdatedAt }).eq('id', page.id)
    setSaving(false)
    if (error) {
      setMessage(publishErrorMessage(error))
    } else {
      setPage((prev) => ({ ...(prev as any), draft, draft_updated_at: draftUpdatedAt }) as AgentPage)
      setMessage('Draft saved (staged). Preview it on your listing, then Publish to go live.')
    }
  }

  async function handlePublishDraft() {
    if (!page) return
    const draft = (page as any).draft
    if (!draft) {
      setMessage('No draft to publish.')
      return
    }
    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({ ...draftToLiveUpdate(draft), draft: null, draft_updated_at: null })
      .eq('id', page.id)
    setSaving(false)
    if (error) {
      setMessage(publishErrorMessage(error))
    } else {
      setPage((prev) => ({ ...(prev as any), ...draftToLiveUpdate(draft), draft: null, draft_updated_at: null }) as AgentPage)
      setMessage('Draft published to live. Your custom domain now serves the new content.')
      // Auto-memory on publish: LLM suggestions available in Settings (use "Suggest with LLM" for platform-configured LLM memory generation when llm_opt_in). The publish flow preserves any existing memory.
    }
  }

  async function duplicateThisPage() {
    if (!page) return
    setMessage('Duplicating…')
    // Server route: clones under the PAGE OWNER (so an editor-collaborator's copy lands
    // in the owner's workspace, not the editor's own account). Authorizes owner/editor.
    try {
      const res = await fetch('/api/pages/duplicate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageId: page.id }),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok || !data.id) {
        setMessage(`Could not duplicate: ${data.error ?? 'unknown error'}`)
        return
      }
      window.location.href = `/dashboard/${data.id}`
    } catch {
      setMessage('Could not duplicate - try again.')
    }
  }

  // Re-sync a connected integration from its STORED credential — no token
  // prompt. Routes through the unified per-listing sync engine (saves server-
  // side, safe source-scoped merge), then reloads to show the result. Connect /
  // disconnect live in Settings -> Integrations.
  async function resyncIntegration(provider: ResyncProvider) {
    if (!id) return
    if (provider === 'stripe') {
      setMessage('Stripe is managed from Settings → Integrations (prices auto-sync from your Stripe account).')
      return
    }
    setIntegrationResyncing(provider)
    try {
      const res = await fetch(`/api/pages/${id}/integrations/${provider}/sync`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 400 here means "not connected" -> the message points to Settings.
        setMessage(data.error || `${RESYNC_LABELS[provider]} sync failed.`)
        return
      }
      setMessage(`Synced ${data.imported ?? 0} ${RESYNC_LABELS[provider]} offer(s) from the saved connection — reloading…`)
      setTimeout(() => window.location.reload(), 600)
    } catch (err: any) {
      setMessage(`${RESYNC_LABELS[provider]} sync failed: ${err.message}`)
    } finally {
      setIntegrationResyncing(null)
    }
  }

  async function sendTestBooking() {
    try {
      const demoSecret = `nexez-test-${Date.now()}`
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
            invitee: { name: 'Test Booker', email: 'test@nexez.app' },
            event: { name: 'Test Consultation', start_time: new Date().toISOString() },
          },
        }),
      })
      if (res.ok) {
        const sb = createClient()
        const { data: freshPage } = await sb.from('pages').select('last_booking').eq('id', id).single()
        if ((freshPage as any)?.last_booking) setLastBooking((freshPage as any).last_booking)
        const { data: events } = await sb
          .from('checkout_events')
          .select('*')
          .eq('slug', slug || page?.slug || '')
          .contains('metadata', { source: 'calendly_webhook' })
          .order('created_at', { ascending: false })
          .limit(3)
        if (events) setRecentCalendlyBookings(events)
        setMessage('Test booking recorded. Connected webhook URLs were notified.')
      }
    } catch {
      setMessage('Test webhook failed. Check the booking settings and try again.')
    }
  }

  async function requestTeamApproval() {
    try {
      const supabase = createClient()
      const current = (page as any)?.team_collaboration || { approvals: [] }
      const newA = {
        id: Date.now().toString(36),
        approver: 'self',
        status: 'pending',
        note: 'Current edits (offers/desc etc)',
        ts: new Date().toISOString(),
      }
      const updated = { ...current, approvals: [...(current.approvals || []), newA] }
      if ((page as any)?.id) {
        await supabase.from('pages').update({ team_collaboration: updated }).eq('id', (page as any).id)
        alert('Approval request saved. Manage it in Settings.')
      } else {
        alert('Save this listing before requesting approval.')
      }
    } catch (e: any) {
      alert('Could not request approval: ' + e.message)
    }
  }

  return {
    id,
    page,
    // status
    saving,
    syncing,
    integrationResyncing,
    message,
    setMessage,
    score,
    // form state + setters
    name,
    setName,
    slug,
    setSlug,
    description,
    setDescription,
    websiteUrl,
    setWebsiteUrl,
    ctaUrl,
    setCtaUrl,
    ctaLabel,
    setCtaLabel,
    audience,
    setAudience,
    location,
    setLocation,
    contactEmail,
    setContactEmail,
    industry,
    setIndustry,
    preferOriginalSite,
    setPreferOriginalSite,
    nextAvailable,
    setNextAvailable,
    googleCalendarId,
    products,
    setProducts,
    services,
    setServices,
    faqs,
    setFaqs,
    servicesOffers,
    setServicesOffers,
    productsOffers,
    setProductsOffers,
    isPublished,
    setIsPublished,
    parsedServices,
    parsedProducts,
    // reanalysis + restore
    pendingReanalysis,
    restoredVersion,
    setRestoredVersion,
    // events / integrations
    recentCalendlyBookings,
    lastBooking,
    recentOutboundFires,
    trustEvents,
    integrationStatus,
    // handlers
    optimizeOffersWithAI,
    enhanceDescriptionWithAI,
    enhanceAllOffers,
    handleSyncFromWebsite,
    startReanalysis,
    applyPendingReanalysis,
    cancelPendingReanalysis,
    handleSubmit,
    handleSaveDraft,
    handlePublishDraft,
    duplicateThisPage,
    resyncIntegration,
    sendTestBooking,
    requestTeamApproval,
  }
}

export type PageEditor = ReturnType<typeof usePageEditor>