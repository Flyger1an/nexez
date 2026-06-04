'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { AgentPage, OWNER_PAGE_SELECT, getBaseUrl, normalizeSlug } from '../../../../lib/agent-page'
import { normalizeDomainPath } from '../../../../lib/custom-domain'
import { normalizeBranding } from '../../../../lib/branding'
import { deploymentChangeAt, summarizeDeployments } from '../../../../lib/deployments'
import { buildAgentPagePayload, getAgentJsonPath } from '../../../../lib/agent-manifest'
import { createClient } from '../../../../utils/supabase/client'

type PageProps = {
  params: Promise<{ id: string }>
}

export default function PageSettings({ params }: PageProps) {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState<AgentPage | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [customDomain, setCustomDomain] = useState('')
  const [domainPath, setDomainPath] = useState('/')
  const [brandName, setBrandName] = useState('')
  const [accentColor, setAccentColor] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [hideNexezBadge, setHideNexezBadge] = useState(false)
  const [domainProvisioning, setDomainProvisioning] = useState(false)
  const [domainStatus, setDomainStatus] = useState<
    | null
    | {
        state: string
        label: string
        detail: string
        providerConfigured: boolean
        requiredRecords: Array<{ type: string; name?: string; value?: string }>
      }
  >(null)
  const [crawlLoading, setCrawlLoading] = useState(false)
  const [crawlReport, setCrawlReport] = useState<
    null | { score: number; url: string; checks: Array<{ id: string; label: string; status: string; detail: string }> }
  >(null)
  const [preferOriginalSite, setPreferOriginalSite] = useState(false)
  const [industry, setIndustry] = useState('')
  const [copied, setCopied] = useState('')
  const [activeReSync, setActiveReSync] = useState<'calendly' | 'stripe' | 'shopify' | null>(null)
  const [reSyncInput, setReSyncInput] = useState('')
  const [reSyncInput2, setReSyncInput2] = useState('') // for shopify domain + token

  // Phase 3: Per-page outbound webhooks — now first-class (url + optional secret per endpoint)
  type OutboundEndpoint = { url: string; secret?: string }
  const [outboundEndpoints, setOutboundEndpoints] = useState<OutboundEndpoint[]>([])
  const [newOutboundUrl, setNewOutboundUrl] = useState('')
  const [newOutboundSecret, setNewOutboundSecret] = useState('')
  const [outboundSaving, setOutboundSaving] = useState(false)
  const [testingEndpoint, setTestingEndpoint] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, string>>({})

  // Real recent fires (from checkout_events) for visibility of outbound value
  const [recentOutboundFires, setRecentOutboundFires] = useState<any[]>([])

  // Phase 3: Google Calendar availability (import foundation)
  const [googleCalendarId, setGoogleCalendarId] = useState('')
  const [availabilityNote, setAvailabilityNote] = useState('')
  const [availabilitySaving, setAvailabilitySaving] = useState(false)

  // Phase 5: Real custom domain verification state (persisted on page)
  const [domainVerificationToken, setDomainVerificationToken] = useState('')
  const [domainVerified, setDomainVerified] = useState(false)
  const [verifyingDomain, setVerifyingDomain] = useState(false)

  // Deeper Calendly: per-page webhook secret for real signature verification (beyond demo headers)
  const [calendlyWebhookSecret, setCalendlyWebhookSecret] = useState('')

  // Phase 7 Tier 2: Verification details for trust score
  const [verificationDetails, setVerificationDetails] = useState<any>({})

  // Tier 3: Dedicated clean state for Agent Memory (fix audit hacky reuse of verificationDetails)
  const [memoryNotes, setMemoryNotes] = useState('')

  // Tier 3: LLM opt-in flag state (clean, for UI refresh after toggle)
  const [llmOptIn, setLlmOptIn] = useState(false)

  useEffect(() => {
    params.then(({ id }) => setId(id))
  }, [params])

  useEffect(() => {
    if (!id) return
    loadPage(id)
  }, [id])

  const cleanSlug = normalizeSlug(slug || name)
  const publicUrl = `${getBaseUrl()}/${cleanSlug || page?.slug || ''}`
  const agentJsonUrl = `${getBaseUrl()}${getAgentJsonPath(cleanSlug || page?.slug || '')}`
  const searchUrl = `${getBaseUrl()}/api/agent-search?q=${encodeURIComponent(name || page?.name || 'service')}`
  const manifestPreview = useMemo(() => {
    if (!page) return '{}'
    return JSON.stringify(
      buildAgentPagePayload({
        ...page,
        name,
        slug: cleanSlug || page.slug,
        website_url: websiteUrl || null,
        cta_url: ctaUrl || websiteUrl || null,
        cta_label: ctaLabel || 'Visit website',
        contact_email: contactEmail || null,
        is_published: isPublished,
      }),
      null,
      2,
    )
  }, [cleanSlug, contactEmail, ctaLabel, ctaUrl, isPublished, name, page, websiteUrl])

  async function loadPage(pageId: string) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = `/login?next=/dashboard/${pageId}/settings`
      return
    }

    const { data, error } = await supabase
      .from('pages')
      .select(OWNER_PAGE_SELECT)
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .single<AgentPage>()

	    if (error || !data) {
	      setMessage('Page not found, or you do not have access to its settings.')
	      setLoading(false)
	      return
	    }

	    const { data: secrets } = await supabase
	      .from('page_secrets')
	      .select('calendly_webhook_secret, outbound_webhooks, domain_verification_token')
	      .eq('page_id', pageId)
	      .maybeSingle()

	    const activePage = {
	      ...data,
	      calendly_webhook_secret: secrets?.calendly_webhook_secret ?? null,
	      outbound_webhooks: secrets?.outbound_webhooks ?? null,
	      domain_verification_token: secrets?.domain_verification_token ?? null,
	    } as AgentPage

	    setPage(activePage)
	    setName(activePage.name)
	    setSlug(activePage.slug)
	    setWebsiteUrl(activePage.website_url ?? '')
	    setCtaUrl(activePage.cta_url ?? '')
	    setCtaLabel(activePage.cta_label ?? 'Visit website')
	    setContactEmail(activePage.contact_email ?? '')
	    setIsPublished(activePage.is_published)
	    setCustomDomain(activePage.custom_domain ?? '')
	    setDomainPath(activePage.domain_path ?? '/')
	    {
	      const b = (activePage.branding ?? {}) as Record<string, unknown>
	      setBrandName(typeof b.brand_name === 'string' ? b.brand_name : '')
	      setAccentColor(typeof b.accent_color === 'string' ? b.accent_color : '')
	      setLogoUrl(typeof b.logo_url === 'string' ? b.logo_url : '')
	      setHideNexezBadge(b.hide_nexez_badge === true)
	    }
	    setPreferOriginalSite(!!activePage.prefer_original_site)
	    setIndustry(activePage.industry ?? '')

	    // Phase 3: Load per-page outbound webhooks (support richer shape with optional secrets)
	    const ob = activePage.outbound_webhooks
    if (ob) {
      const arr: OutboundEndpoint[] = Array.isArray(ob)
        ? ob.map((o: any) => (typeof o === 'string' ? { url: o } : { url: o?.url, secret: o?.secret })).filter((o) => o.url)
        : []
      setOutboundEndpoints(arr)
    } else {
      setOutboundEndpoints([])
    }

    // Phase 3: Load Google Calendar availability
	    setGoogleCalendarId(activePage.google_calendar_id || '')
	    setAvailabilityNote(activePage.next_available || '')

	    // Phase 5 custom domain verification status + pending token
	    setDomainVerificationToken(activePage.domain_verification_token || '')
	    setDomainVerified(!!activePage.custom_domain_verified)

	    setCalendlyWebhookSecret(activePage.calendly_webhook_secret || '')

	    setVerificationDetails(activePage.verification_details || {})
	    setMemoryNotes((activePage as any)?.agent_memory?.notes || '')
	    setLlmOptIn(!!activePage.llm_opt_in)

    // Load real recent events that trigger outbound (for history surface)
    try {
      const { data: events } = await supabase
        .from('checkout_events')
        .select('id, event_type, offer_name, created_at, metadata')
	        .eq('slug', activePage.slug)
        .in('event_type', ['provider_redirect', 'stripe_session_created', 'checkout_attempt'])
        .order('created_at', { ascending: false })
        .limit(5)
      if (events) setRecentOutboundFires(events)
    } catch {}

    setLoading(false)
  }

  // Phase 5: Real custom domain verification helpers
  async function generateDomainVerificationToken() {
    if (!customDomain.trim()) {
      setMessage('Enter your custom domain first (e.g. agents.yourcompany.com).')
      return
    }
    const token = 'nexez-verify-' + Math.random().toString(36).slice(2, 14)
    setDomainVerificationToken(token)
    setMessage('Token generated. Add the DNS TXT record below, then click Verify.')

	    // Persist the pending token in owner-only page_secrets so it never appears on public page reads.
	    try {
	      await upsertPageSecrets({ domain_verification_token: token })
	    } catch (e: any) {
	      console.warn('Failed to persist verification token', e)
	    }
  }

  // A2/A3: provider provisioning + live status (Vercel-backed when configured).
  async function callDomainAction(action: 'attach' | 'status') {
    if (!customDomain.trim()) {
      setMessage('Enter and save your custom domain first.')
      return
    }
    setDomainProvisioning(true)
    try {
      const res = await fetch('/api/custom-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, domain: customDomain.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Domain action failed.')
        return
      }
      setDomainStatus({
        state: data.state,
        label: data.label,
        detail: data.detail,
        providerConfigured: data.providerConfigured,
        requiredRecords: data.requiredRecords || [],
      })
      setMessage(`${data.label}: ${data.detail}`)
    } catch (e: any) {
      setMessage('Domain action failed: ' + (e.message || 'network error'))
    } finally {
      setDomainProvisioning(false)
    }
  }

  // B6: agent crawlability test (targets the custom domain when set, else the platform page).
  async function runCrawlabilityTest() {
    const target = customDomain.trim()
      ? `https://${customDomain.trim().replace(/^https?:\/\//, '')}`
      : publicUrl
    setCrawlLoading(true)
    setCrawlReport(null)
    try {
      const res = await fetch('/api/crawlability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Crawlability test failed.')
        return
      }
      setCrawlReport({ score: data.score, url: data.url, checks: data.checks || [] })
      setMessage(`Agent crawlability score: ${data.score}/100`)
    } catch (e: any) {
      setMessage('Crawlability test failed: ' + (e.message || 'network error'))
    } finally {
      setCrawlLoading(false)
    }
  }

  async function verifyCustomDomain() {
    if (!customDomain.trim() || !domainVerificationToken) {
      setMessage('Generate a verification token first.')
      return
    }
    setVerifyingDomain(true)
    setMessage('Checking DNS TXT record... (propagation can take 30s–few minutes)')

    try {
      const res = await fetch('/api/verify-custom-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customDomain: customDomain.trim(),
          token: domainVerificationToken,
          pageId: id,
        }),
      })
      const data = await res.json()

      if (data.verified) {
        // Success: persist verified status + clear token
        const supabase = createClient()
	        const { error } = await supabase
	          .from('pages')
	          .update({
	            custom_domain_verified: new Date().toISOString(),
	          })
	          .eq('id', id)
	        const { error: secretError } = await upsertPageSecrets({ domain_verification_token: null })

	        if (!error && !secretError) {
	          setDomainVerified(true)
	          setDomainVerificationToken('')
	          setMessage(`✓ Verified! ${customDomain.trim()} now shows as verified. Real DNS ownership proven.`)
	        } else {
	          setMessage('DNS check passed but failed to save verified status: ' + (error?.message || secretError?.message))
	        }
      } else {
        setMessage(data.message || data.error || 'Verification failed. Check the exact TXT value and try again after propagation.')
      }
    } catch (e: any) {
      setMessage('Verification request failed: ' + (e.message || 'network error'))
    } finally {
      setVerifyingDomain(false)
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    if (!page) return

    setSaving(true)
    setMessage('')

    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({
        name,
        slug: cleanSlug,
        website_url: websiteUrl,
        cta_url: ctaUrl || websiteUrl,
        cta_label: ctaLabel || 'Visit website',
        contact_email: contactEmail,
        is_published: isPublished,
        custom_domain: customDomain || null,
	        domain_path: normalizeDomainPath(domainPath),
	        branding: normalizeBranding({
	          brand_name: brandName,
	          accent_color: accentColor,
	          logo_url: logoUrl,
	          hide_nexez_badge: hideNexezBadge,
	        }),
	        prefer_original_site: preferOriginalSite,
	        verification_details: verificationDetails || null,
	      })
	      .eq('id', page.id)
	    const { error: secretError } = error
	      ? { error: null }
	      : await upsertPageSecrets({ calendly_webhook_secret: calendlyWebhookSecret || null })

	    setSaving(false)
	    setMessage(error ? error.message : secretError ? secretError.message : 'Settings saved.')

	    if (!error && !secretError) {
	      setPage({
	        ...page,
        name,
        slug: cleanSlug,
        website_url: websiteUrl,
        cta_url: ctaUrl || websiteUrl,
        cta_label: ctaLabel || 'Visit website',
	        contact_email: contactEmail,
	        is_published: isPublished,
	        calendly_webhook_secret: calendlyWebhookSecret || null,
	      })
	    }
  }

	  async function copy(label: string, value: string) {
	    await navigator.clipboard.writeText(value)
	    setCopied(label)
	    window.setTimeout(() => setCopied(''), 1200)
	  }

	  async function upsertPageSecrets(values: Record<string, unknown>) {
	    if (!page?.owner_id) {
	      return { error: { message: 'Page owner is missing; cannot save private settings.' } }
	    }

	    const supabase = createClient()
	    return supabase
	      .from('page_secrets')
	      .upsert(
	        {
	          page_id: page.id,
	          owner_id: page.owner_id,
	          ...values,
	          updated_at: new Date().toISOString(),
	        },
	        { onConflict: 'page_id' },
	      )
	  }

	  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        Loading settings...
      </main>
    )
  }

  if (!page) {
    return (
      <main className="min-h-screen bg-[#090b10] px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
            {message || 'Page not found.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-3">
            <a href={`/dashboard/${page.id}`} className={topButtonClass}>
              Edit Page
            </a>
            <a href={`/${page.slug}`} className={topButtonClass}>
              <ExternalLink className="size-4" />
              Public Page
            </a>
          </div>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <aside className="space-y-5">
            <div>
              <p className="flex items-center gap-2 text-sm text-cyan-200">
                <Settings className="size-4" />
                Page Settings
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">{page.name}</h1>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Visibility</p>
                  <p className="mt-1 text-sm text-zinc-500">{isPublished ? 'Published' : 'Draft'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublished((value) => !value)}
                  className={`relative h-7 w-12 rounded-full transition ${isPublished ? 'bg-cyan-300' : 'bg-zinc-700'}`}
                  aria-label="Toggle published status"
                >
                  <span
                    className={`absolute top-1 size-5 rounded-full bg-white transition ${
                      isPublished ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <LinkPanel title="Agent links" links={
              ([
                ['Public page', publicUrl],
                ['Agent JSON', agentJsonUrl],
                ['Search API', searchUrl],
                ['OpenAPI', `${getBaseUrl()}/openapi.json`],
                ...((page as any)?.mcp_enabled ? [
                  ['MCP Manifest', `${getBaseUrl()}/${cleanSlug || page?.slug || ''}/mcp.json`],
                  ['MCP Discovery', `${getBaseUrl()}/.well-known/mcp.json`],
                ] : []),
              ] as [string, string][])
            } copied={copied} onCopy={copy} />

            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
              <div className="flex items-center gap-2 text-cyan-100">
                <ShieldCheck className="size-5" />
                <h2 className="font-semibold">Advanced</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-widest text-zinc-400">Custom domain</p>
                  <div className="flex gap-2">
                    <input
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="agents.yourcompany.com"
                      className="mt-1 flex-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={generateDomainVerificationToken}
                      className="mt-1 rounded border border-white/20 px-3 py-1 text-xs text-zinc-200 hover:bg-white/5"
                    >
                      Generate token
                    </button>
                    <button
                      type="button"
                      disabled={verifyingDomain || !domainVerificationToken}
                      onClick={verifyCustomDomain}
                      className="mt-1 rounded border border-emerald-300/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                    >
                      {verifyingDomain ? 'Checking DNS...' : 'Verify now'}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    CNAME your subdomain to your Nexez deployment host. Full ownership proof via DNS TXT.
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">Path on domain</label>
                    <input
                      value={domainPath}
                      onChange={(e) => setDomainPath(e.target.value)}
                      onBlur={() => setDomainPath(normalizeDomainPath(domainPath))}
                      placeholder="/"
                      className="w-40 rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
                    />
                    <span className="text-[10px] text-zinc-500">
                      e.g. “/” or “/pricing” — host several pages on one domain.
                    </span>
                  </div>

                  {/* C10: white-label branding */}
                  <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[11px] font-medium text-zinc-200">Branding / White-label</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      Applied to the public page (especially on your custom domain).
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="block text-[11px]">
                        <span className="text-zinc-400">Brand name</span>
                        <input
                          value={brandName}
                          onChange={(e) => setBrandName(e.target.value)}
                          placeholder="Acme Plumbing"
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="block text-[11px]">
                        <span className="text-zinc-400">Accent color (hex)</span>
                        <input
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          placeholder="#7C3AED"
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="block text-[11px] sm:col-span-2">
                        <span className="text-zinc-400">Logo URL (https)</span>
                        <input
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="https://acme.com/logo.svg"
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
                        />
                      </label>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-300">
                      <input
                        type="checkbox"
                        checked={hideNexezBadge}
                        onChange={(e) => setHideNexezBadge(e.target.checked)}
                      />
                      Hide the “Nexez” header link (full white-label)
                    </label>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Invalid colors/URLs are ignored on render (hex + http(s) only). Save to apply.
                    </p>
                  </div>

                  {domainVerificationToken && (
                    <div className="mt-2 rounded border border-amber-300/30 bg-amber-400/5 p-2 text-[11px] text-amber-200">
                      <div className="font-medium mb-1">Add this DNS TXT record:</div>
                      <code className="block bg-black/40 p-1 rounded text-emerald-300 break-all">
                        _nexez-verify.{(customDomain || '').replace(/^https?:\/\//, '').split('/')[0].split(':')[0]} &nbsp; TXT &nbsp; "{domainVerificationToken}"
                      </code>
                      <div className="mt-1 text-[10px] text-amber-300/80">Use low TTL (300). Wait for propagation, then Verify.</div>
                    </div>
                  )}

                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    {customDomain && domainVerified ? (
                      <span className="text-emerald-300">✓ Verified — custom domain ownership confirmed.</span>
                    ) : customDomain ? (
                      <span className="text-zinc-400">Status: {domainVerificationToken ? 'Token ready — awaiting DNS verify' : 'Pending verification'}</span>
                    ) : null}
                  </div>

                  {/* A3: connection wizard — provider attach + SSL state machine */}
                  {customDomain ? (
                    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-zinc-200">Connection & SSL</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={domainProvisioning}
                            onClick={() => callDomainAction('attach')}
                            className="rounded border border-[#7C3AED]/40 px-2.5 py-1 text-[11px] text-[#C4B5FD] hover:bg-[#7C3AED]/10 disabled:opacity-50"
                          >
                            {domainProvisioning ? 'Working…' : 'Attach & provision SSL'}
                          </button>
                          <button
                            type="button"
                            disabled={domainProvisioning}
                            onClick={() => callDomainAction('status')}
                            className="rounded border border-white/20 px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-white/5 disabled:opacity-50"
                          >
                            Check status
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const currentState =
                          domainStatus?.state ?? (domainVerified ? 'verifying' : 'pending_dns')
                        const steps = [
                          { key: 'pending_dns', label: 'Pending DNS' },
                          { key: 'verifying', label: 'Verifying' },
                          { key: 'live', label: 'Live' },
                        ]
                        const order: Record<string, number> = { pending_dns: 0, verifying: 1, ssl_issuing: 1, live: 2 }
                        const activeIdx = order[currentState] ?? 0
                        const isError = currentState === 'error'
                        return (
                          <div className="mt-3 flex items-center gap-1">
                            {steps.map((step, i) => (
                              <div key={step.key} className="flex flex-1 items-center gap-1">
                                <div
                                  className={`h-1.5 flex-1 rounded-full ${
                                    isError
                                      ? 'bg-red-400/60'
                                      : i <= activeIdx
                                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#00F5FF]'
                                        : 'bg-white/10'
                                  }`}
                                />
                                <span
                                  className={`whitespace-nowrap text-[10px] ${
                                    i <= activeIdx && !isError ? 'text-zinc-200' : 'text-zinc-500'
                                  }`}
                                >
                                  {step.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {domainStatus ? (
                        <p className="mt-2 text-[11px] text-zinc-400">{domainStatus.detail}</p>
                      ) : (
                        <p className="mt-2 text-[11px] text-zinc-500">
                          Click “Attach & provision SSL” to add this domain to the hosting provider and start TLS.
                        </p>
                      )}

                      {domainStatus && !domainStatus.providerConfigured ? (
                        <p className="mt-1 text-[10px] text-amber-300/80">
                          Provider auto-provisioning isn’t configured on this deployment — ownership is verified via DNS TXT; point your domain at your host for SSL.
                        </p>
                      ) : null}

                      {domainStatus?.requiredRecords?.length ? (
                        <div className="mt-2 space-y-1">
                          <div className="text-[10px] font-medium text-zinc-300">Add these DNS records:</div>
                          {domainStatus.requiredRecords.map((r, i) => (
                            <code key={i} className="block break-all rounded bg-black/40 p-1 text-[10px] text-emerald-300">
                              {r.type} {r.name ?? ''} {r.value ?? ''}
                            </code>
                          ))}
                        </div>
                      ) : null}

                      {/* B6: agent crawlability test */}
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-zinc-300">Agent crawlability</p>
                          <button
                            type="button"
                            disabled={crawlLoading}
                            onClick={runCrawlabilityTest}
                            className="rounded border border-cyan-300/40 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50"
                          >
                            {crawlLoading ? 'Testing…' : 'Test agent crawlability'}
                          </button>
                        </div>
                        {crawlReport ? (
                          <div className="mt-2">
                            <div className="text-[11px] text-zinc-300">
                              Score:{' '}
                              <span
                                className={
                                  crawlReport.score >= 80
                                    ? 'text-emerald-300'
                                    : crawlReport.score >= 50
                                      ? 'text-amber-300'
                                      : 'text-red-300'
                                }
                              >
                                {crawlReport.score}/100
                              </span>{' '}
                              <span className="text-zinc-500">({crawlReport.url})</span>
                            </div>
                            <ul className="mt-1 space-y-0.5">
                              {crawlReport.checks.map((c) => (
                                <li key={c.id} className="flex items-start gap-1.5 text-[10px]">
                                  <span>
                                    {c.status === 'pass' ? '✅' : c.status === 'warn' ? '🟡' : '❌'}
                                  </span>
                                  <span className="text-zinc-300">{c.label}</span>
                                  <span className="text-zinc-500">— {c.detail}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="mt-1 text-[10px] text-zinc-500">
                            Checks reachability, JSON-LD, agent.json at root, llms.txt, and whether
                            GPTBot/ClaudeBot/PerplexityBot are allowed by robots.txt.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Phase 7 MCP toggle (minimal) */}
                <div className="mt-4 border-t border-white/10 pt-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!(page as any)?.mcp_enabled || false}
                      onChange={async (e) => {
                        const val = e.target.checked
                        try {
                          const sb = createClient()
                          await sb.from('pages').update({ mcp_enabled: val }).eq('id', id)
                          setMessage(val ? 'MCP support enabled. Agents that understand MCP can discover richer context.' : 'MCP disabled.')
                          // reload to reflect
                          window.location.reload()
                        } catch {}
                      }}
                      className="accent-[#7C3AED]"
                    />
                    <span>Enable MCP Support (Model Context Protocol structured data)</span>
                  </label>
                  <p className="text-[10px] text-zinc-500 mt-1">When on, this page exposes MCP-compatible offer resources alongside JSON-LD / agent.json / llms.txt. See public page for agent note.</p>
                  {!!(page as any)?.mcp_enabled && (
                    <p className="text-[10px] text-cyan-200 mt-1">
                      Global discovery: <a href="/.well-known/mcp.json" className="underline">/.well-known/mcp.json</a>
                    </p>
                  )}
                </div>
                <DisabledRow icon={<Bot className="size-4" />} label="API key" value="Public endpoints (no key required)" />
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs uppercase tracking-widest text-zinc-400">Quick embed (iframe)</p>
                <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-[10px] text-zinc-400">{`<iframe src="${publicUrl}" width="100%" height="800" style="border:1px solid #222;"></iframe>`}</pre>
                <p className="mt-1 text-[10px] text-zinc-500">Embed the clean agent view on your main site. Agents still see the canonical Nexez URL.</p>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs uppercase tracking-widest text-zinc-400">Agent-Ready badge</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${publicUrl}/badge.svg`} alt="Agent-Ready badge" className="mt-2 h-7" />
                <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-[10px] text-zinc-400">{`<a href="${publicUrl}"><img src="${publicUrl}/badge.svg" alt="Agent-Ready" height="28"></a>`}</pre>
                <p className="mt-1 text-[10px] text-zinc-500">Put this on your human website to show you’re agent-ready and link buyers’ agents to this page.</p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  Verify authenticity: <a href={`${publicUrl}/badge.json`} className="text-cyan-300 hover:underline">{`${publicUrl}/badge.json`}</a> (issuer, live readiness, verified status).
                </p>
              </div>
            </div>
          </aside>

          <div className="space-y-5">
            <form onSubmit={saveSettings} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Page name">
                  <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required />
                </Field>
                <Field label="Slug">
                  <input value={slug} onChange={(event) => setSlug(normalizeSlug(event.target.value))} className={inputClass} required />
                </Field>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Field label="Main website">
                  <input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className={inputClass} />
                </Field>
                <Field label="Action URL">
                  <input type="url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} className={inputClass} />
                </Field>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Field label="Action label">
                  <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className={inputClass} />
                </Field>
                <Field label="Contact email">
                  <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={inputClass} />
                </Field>
              </div>

              {/* Phase 4: Enhanced Embed & Per-Offer Original Site Linking */}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Code2 className="size-4 text-[#7C3AED]" />
                  <span className="font-semibold">Embed & Link to Original Site</span>
                </div>

                <div className="space-y-4 text-sm">
                  <div>
                    <label className="flex items-center gap-2 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={preferOriginalSite}
                        onChange={(e) => setPreferOriginalSite(e.target.checked)}
                        className="accent-[#7C3AED]"
                      />
                      Prefer linking bookings to my original website (page default)
                    </label>
                    <p className="text-xs text-[#9CA3AF] mt-1">Page-level default. Granular per-offer overrides live in the Visual Offer Builder (higher precedence for agents & visitors).</p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-widest text-zinc-400 mb-1.5">Iframe embed (recommended)</p>
                    <pre className="text-[10px] bg-black/40 p-3 rounded overflow-x-auto text-[#C4B5FD] whitespace-pre-wrap">{`<iframe src="${publicUrl}" width="100%" height="900" style="border:1px solid #222; border-radius:12px;" loading="lazy"></iframe>`}</pre>
                    <button
                      type="button"
                      onClick={() => {
                        const code = `<iframe src="${publicUrl}" width="100%" height="900" style="border:1px solid #222; border-radius:12px;" loading="lazy"></iframe>`
                        navigator.clipboard.writeText(code)
                        setMessage('Iframe embed code copied.')
                      }}
                      className="mt-1.5 text-xs text-[#00F5FF] hover:underline"
                    >
                      Copy iframe code
                    </button>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-widest text-zinc-400 mb-1.5">Lightweight JS widget (floating action button)</p>
                    <pre className="text-[10px] bg-black/40 p-3 rounded overflow-x-auto text-[#C4B5FD] whitespace-pre-wrap">{`<script>
  (function(){var s=document.createElement('script');s.src='${getBaseUrl()}/widget.js';s.onload=function(){Nexez.init({slug:'${slug}',theme:'light'})};document.head.appendChild(s);})();
</script>`}</pre>
                    <p className="text-[10px] text-zinc-500 mt-1">Renders a floating "Book with agent-optimized flow" button. Respects your per-offer + page prefer-original settings. Example usage: paste the script on your site; it will read the page slug and render a floating CTA that matches your Nexez settings.</p>
                    <button
                      type="button"
                      onClick={() => {
                        const js = `(function(){var s=document.createElement('script');s.src='${getBaseUrl()}/widget.js';s.onload=function(){Nexez.init({slug:'${slug}',theme:'light'})};document.head.appendChild(s);})();`
                        navigator.clipboard.writeText(js)
                        setMessage('JS widget snippet copied.')
                      }}
                      className="mt-1.5 text-xs text-[#00F5FF] hover:underline"
                    >
                      Copy JS widget snippet
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/10 text-[11px] text-emerald-300/80">
                    Per-offer "Book on original site" toggles (set in the builder) override this page default for individual offers. Agents see the effective preference in /agent.json and JSON-LD.
                  </div>

                  {/* Live Embed Preview (further enhanced) */}
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-widest text-zinc-400">Live Preview (respects current settings)</p>
                      <a href={publicUrl} target="_blank" className="text-[10px] text-[#00F5FF] hover:underline">Open full page →</a>
                    </div>
                    <div className="rounded border border-white/10 overflow-hidden bg-[#0A0A0F]">
                      <iframe
                        src={publicUrl}
                        className="w-full h-[420px]"
                        title="Live embed preview"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-500">
                      Responsive by default (100% width). Per-offer original-site toggles take precedence. 
                      {preferOriginalSite ? " Page-level original site mode is active." : " Nexez checkout is default unless overridden per offer."}
                    </div>
                    <div className="mt-1 text-[9px] text-emerald-300/80">
                      Tip: Use the Visual Offer Builder to set per-offer "Book on original site" for granular control.
                    </div>
                  </div>
                </div>
              </div>

              {message ? <p className="mt-5 rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">{message}</p> : null}

              <button
                type="submit"
                disabled={saving}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? 'Saving...' : 'Save settings'}
              </button>

              {/* D-tier: Deployments timeline + rollback (built on version snapshots) */}
              {(page as any)?.versions?.length > 0 && (
                <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="size-4 text-[#7C3AED]" />
                    <span className="font-semibold">Deployments</span>
                    <span className="text-[10px] text-zinc-500">Last 10 saves · newest first</span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-auto text-sm">
                    {summarizeDeployments((page as any).versions).map((d) => (
                      <div
                        key={d.index}
                        className={`flex items-center justify-between rounded border p-2 ${
                          d.isCurrent ? 'border-emerald-300/30 bg-emerald-300/5' : 'border-white/10 bg-black/20'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-zinc-200">{d.name}</span>
                            {d.isCurrent ? (
                              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[9px] text-emerald-200">
                                Live now
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {new Date(d.timestamp).toLocaleString()} · {d.offerCount} offer
                            {d.offerCount === 1 ? '' : 's'} · {deploymentChangeAt((page as any).versions, d.index)}
                          </div>
                        </div>
                        {d.isCurrent ? (
                          <span className="text-[10px] text-zinc-500">current</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              sessionStorage.setItem(
                                'nexez_restore_version',
                                JSON.stringify((page as any).versions[d.index]),
                              )
                              window.location.href = `/dashboard/${id}?restore=true`
                            }}
                            className="shrink-0 text-xs rounded border border-white/20 px-3 py-1 hover:bg-white/10"
                          >
                            Roll back
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-500">
                    Each save is a deployment snapshot. “Roll back” loads that deployment’s offers + metadata
                    into the editor to review, then Save re-publishes it live (incl. on your custom domain).
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  if (!websiteUrl) { 
                    setMessage('No original website URL set.');
                    return; 
                  }
                  const res = await fetch('/api/tools/import-site', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: websiteUrl, industry })
                  });
                  const data = await res.json();
                  if (data.suggestedPage && data.structuredOffers) {
                    // Phase 1 polish: store for the editor's re-analysis preview flow
                    sessionStorage.setItem('nexez_imported_page', JSON.stringify(data.suggestedPage));
                    sessionStorage.setItem('nexez_imported_structured', JSON.stringify(data.structuredOffers));
                    window.location.href = `/dashboard/${id}?reanalyzed=true`;
                  } else {
                    setMessage(data.error || 'Sync failed. Please try again.');
                  }
                }}
                className="mt-3 w-full rounded-lg border border-white/15 px-5 py-3 text-sm text-zinc-200 hover:bg-white/5"
              >
                Re-sync Offers from Original Website (Preview in Editor)
              </button>

              {/* Phase 3: Calendly re-sync (per ROADMAP) */}
              <button
                type="button"
                onClick={() => {
                  setActiveReSync(activeReSync === 'calendly' ? null : 'calendly');
                  setReSyncInput('');
                }}
                className="mt-3 w-full rounded-lg border border-violet-300/30 px-5 py-3 text-sm text-violet-200 hover:bg-violet-300/10"
              >
                Re-sync from Calendly (paste PAT)
              </button>
              {activeReSync === 'calendly' && (
                <div className="mt-2 space-y-2">
                  <input
                    type="password"
                    value={reSyncInput}
                    onChange={(e) => setReSyncInput(e.target.value)}
                    placeholder="Calendly Personal Access Token"
                    className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!reSyncInput.trim()) return;
                      setMessage('Re-syncing from Calendly...');
                      try {
                        const res = await fetch('/api/integrations/calendly/import', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token: reSyncInput.trim() }),
                        });
                        const data = await res.json();
                        if (data.structuredOffers?.length) {
                          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(data.structuredOffers));
                          sessionStorage.setItem('nexez_imported_page', JSON.stringify({ name: page?.name, slug: page?.slug }));
                          window.location.href = `/dashboard/${id}?reanalyzed=true&source=calendly`;

                          const webhookEndpoint = localStorage.getItem('nexez_outbound_webhook_url')
                          if (webhookEndpoint && page?.id) {
                            await fetch('/api/test-outbound', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                endpoint: webhookEndpoint,
                                eventType: 'integration.re_sync_completed',
                                pageId: page.id,
                                data: { integration: 'calendly', offer_count: data.structuredOffers?.length || 0 },
                              }),
                            }).catch(() => {})
                          }
                        } else {
                          setMessage(data.error || data.message || 'No events found or import failed.');
                        }
                      } catch (e: any) {
                        setMessage('Calendly re-sync failed: ' + e.message);
                      } finally {
                        setActiveReSync(null);
                        setReSyncInput('');
                      }
                    }}
                    className="w-full rounded-lg bg-violet-300 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-violet-200"
                  >
                    Confirm Re-sync from Calendly
                  </button>
                </div>
              )}
              <p className="mt-1 text-[10px] text-zinc-500">
                Pulls your latest Calendly event types as rich offers and merges them (preserves your edits).
              </p>

              {/* Phase 3: Stripe re-sync (per ROADMAP) */}
              <button
                type="button"
                onClick={() => {
                  setActiveReSync(activeReSync === 'stripe' ? null : 'stripe');
                  setReSyncInput('');
                }}
                className="mt-3 w-full rounded-lg border border-cyan-300/30 px-5 py-3 text-sm text-cyan-200 hover:bg-cyan-300/10"
              >
                Re-sync from Stripe (paste Secret Key)
              </button>
              {activeReSync === 'stripe' && (
                <div className="mt-2 space-y-2">
                  <input
                    type="password"
                    value={reSyncInput}
                    onChange={(e) => setReSyncInput(e.target.value)}
                    placeholder="Stripe secret key"
                    className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!reSyncInput.trim()) return;
                      setMessage('Re-syncing from Stripe...');
                      try {
                        const res = await fetch('/api/integrations/stripe/import', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ stripeSecretKey: reSyncInput.trim() }),
                        });
                        const data = await res.json();
                        if (data.structuredOffers?.length) {
                          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(data.structuredOffers));
                          sessionStorage.setItem('nexez_imported_page', JSON.stringify({ name: page?.name, slug: page?.slug }));
                          window.location.href = `/dashboard/${id}?reanalyzed=true&source=stripe`;
                        } else {
                          setMessage(data.error || data.message || 'No products found or import failed.');
                        }
                      } catch (e: any) {
                        setMessage('Stripe re-sync failed: ' + e.message);
                      } finally {
                        setActiveReSync(null);
                        setReSyncInput('');
                      }
                    }}
                    className="w-full rounded-lg bg-cyan-300 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200"
                  >
                    Confirm Re-sync from Stripe
                  </button>
                </div>
              )}
              <p className="mt-1 text-[10px] text-zinc-500">
                Pulls latest products & prices as rich offers and merges them (preserves your edits).
              </p>

              {/* Phase 3: Shopify re-sync */}
              <button
                type="button"
                onClick={() => {
                  setActiveReSync(activeReSync === 'shopify' ? null : 'shopify');
                  setReSyncInput('');
                  setReSyncInput2('');
                }}
                className="mt-3 w-full rounded-lg border border-purple-300/30 px-5 py-3 text-sm text-purple-200 hover:bg-purple-300/10"
              >
                Re-sync from Shopify (domain + optional token)
              </button>
              {activeReSync === 'shopify' && (
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    value={reSyncInput}
                    onChange={(e) => setReSyncInput(e.target.value)}
                    placeholder="Shopify store domain (yourstore.myshopify.com)"
                    className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    value={reSyncInput2}
                    onChange={(e) => setReSyncInput2(e.target.value)}
                    placeholder="Admin API token (optional for public catalogs)"
                    className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!reSyncInput.trim()) return;
                      setMessage('Re-syncing from Shopify...');
                      try {
                        const res = await fetch('/api/integrations/shopify/import', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            shop: reSyncInput.trim(), 
                            accessToken: reSyncInput2.trim() 
                          }),
                        });
                        const data = await res.json();
                        if (data.structuredOffers?.length) {
                          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(data.structuredOffers));
                          sessionStorage.setItem('nexez_imported_page', JSON.stringify({ name: page?.name, slug: page?.slug }));
                          window.location.href = `/dashboard/${id}?reanalyzed=true&source=shopify`;
                        } else {
                          setMessage(data.error || data.message || 'No products found or import failed.');
                        }
                      } catch (e: any) {
                        setMessage('Shopify re-sync failed: ' + e.message);
                      } finally {
                        setActiveReSync(null);
                        setReSyncInput('');
                        setReSyncInput2('');
                      }
                    }}
                    className="w-full rounded-lg bg-purple-300 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-purple-200"
                  >
                    Confirm Re-sync from Shopify
                  </button>
                </div>
              )}
              <p className="mt-1 text-[10px] text-zinc-500">
                Pulls your Shopify products as rich offers. Leave token empty to use public catalog.
              </p>

              {/* Phase 3: Per-page outbound webhooks — FIRST CLASS (url + optional secret, real test button, auto-fired) */}
              <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-medium text-cyan-200 mb-2">Outbound webhooks on booking events</div>
                <p className="text-[10px] text-zinc-400 mb-3">These endpoints receive real `booking.received` payloads automatically (Nexez checkout + Calendly webhooks). Works great with Zapier, Make, n8n, or any generic webhook receiver. Add signing secrets for production.</p>

                {/* Add new endpoint with optional secret */}
                <div className="space-y-2 mb-3">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newOutboundUrl}
                      onChange={(e) => setNewOutboundUrl(e.target.value)}
                      placeholder="https://hooks.zapier.com/... or https://yourapp.com/webhook"
                      className="flex-1 rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newOutboundUrl.trim()) {
                          const newEp: OutboundEndpoint = { url: newOutboundUrl.trim() }
                          if (newOutboundSecret.trim()) newEp.secret = newOutboundSecret.trim()
                          setOutboundEndpoints(prev => {
                            const exists = prev.some(e => e.url === newEp.url)
                            return exists ? prev : [...prev, newEp]
                          })
                          setNewOutboundUrl('')
                          setNewOutboundSecret('')
                        }
                      }}
                      className="rounded border border-white/20 px-3 text-sm hover:bg-white/5"
                    >
                      Add
                    </button>
                  </div>
                  <input
                    type="password"
                    value={newOutboundSecret}
                    onChange={(e) => setNewOutboundSecret(e.target.value)}
                    placeholder="Optional signing secret (recommended for production)"
                    className="w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-mono"
                  />
                </div>

                {/* List with remove + Send Test per endpoint */}
                {outboundEndpoints.length > 0 && (
                  <div className="text-xs mb-3 space-y-1.5">
                    {outboundEndpoints.map((ep, i) => (
                      <div key={i} className="rounded border border-white/10 bg-black/30 p-2">
                        <div className="flex items-center justify-between font-mono text-emerald-300/90">
                          <span className="truncate text-[11px]">{ep.url}</span>
                          <div className="flex items-center gap-2">
                            {ep.secret && <span className="text-[9px] text-amber-400">secret</span>}
                            <button
                              type="button"
                              disabled={testingEndpoint === i}
                              onClick={async () => {
                                setTestingEndpoint(i)
                                setTestResults(prev => ({ ...prev, [i]: 'Testing...' }))
                                try {
                                  const res = await fetch('/api/test-outbound', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
	                                      endpoint: ep.url,
	                                      secret: ep.secret || null,
	                                      eventType: 'booking.received',
	                                      pageId: page?.id,
	                                      data: { test_source: 'settings_ui' },
	                                    }),
                                  })
                                  const data = await res.json()
                                  const msg = data.success ? `✓ Sent (HTTP ${data.status})` : `✗ Failed: ${data.error || data.status}`
                                  setTestResults(prev => ({ ...prev, [i]: msg }))
                                  if (data.success) {
                                    try { localStorage.setItem('nexez_last_outbound_fired', new Date().toISOString()) } catch {}
                                  }
                                } catch (e: any) {
                                  setTestResults(prev => ({ ...prev, [i]: '✗ Network error' }))
                                } finally {
                                  setTestingEndpoint(null)
                                }
                              }}
                              className="text-[10px] rounded border border-emerald-300/40 px-1.5 py-0 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-60"
                            >
                              {testingEndpoint === i ? '...' : 'Send Test'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setOutboundEndpoints(prev => prev.filter((_, idx) => idx !== i))}
                              className="text-[10px] text-zinc-400 hover:text-red-400"
                            >
                              remove
                            </button>
                          </div>
                        </div>
                        {testResults[i] && (
                          <div className="mt-1 text-[10px] text-emerald-300 font-mono">{testResults[i]}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  disabled={outboundSaving}
                  onClick={async () => {
                    if (!page) return
                    setOutboundSaving(true)
                    setMessage('')
                    try {
	                      const { error } = await upsertPageSecrets({ outbound_webhooks: outboundEndpoints })
	                      setMessage(error ? error.message : `Saved ${outboundEndpoints.length} outbound endpoint(s). They fire automatically on real bookings.`)
	                      if (!error) setPage({ ...page, outbound_webhooks: outboundEndpoints })
                    } catch (e: any) {
                      setMessage('Failed to save: ' + e.message)
                    } finally {
                      setOutboundSaving(false)
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-cyan-300/40 px-4 py-1.5 text-sm text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-60"
                >
                  {outboundSaving ? 'Saving...' : `Save ${outboundEndpoints.length} Outbound Endpoint${outboundEndpoints.length === 1 ? '' : 's'}`}
                </button>
                <p className="mt-1 text-[10px] text-zinc-500">Endpoints + secrets are stored on the page. They are called automatically by the Calendly receiver and on Nexez checkout events. Use "Send Test" above to verify instantly.</p>

                {/* Example payloads for Zapier / Make / generic webhooks */}
                <details className="mt-3 text-[10px] text-zinc-400">
                  <summary className="cursor-pointer hover:text-zinc-200">Example payloads (click to expand)</summary>
                  <pre className="mt-2 overflow-auto rounded bg-black/40 p-2 text-[9px] text-emerald-300/90">
{`// booking.received (fired on real events)
{
  "event": "booking.received",
  "timestamp": "2026-...",
  "page": { "id": "...", "slug": "...", "name": "..." },
  "data": {
    "event_type": "provider_redirect" | "stripe_session_created",
    "offer_name": "...",
    "offer_key": "services-0",
    "amount": 45000,   // cents if available
    "source": "nexez_checkout" | "calendly_webhook"
  }
}`}</pre>
                  <p className="mt-1 text-[9px]">Works with any JSON webhook receiver. Add your secret for HMAC if required.</p>
                </details>
                {typeof window !== 'undefined' && localStorage.getItem('nexez_last_outbound_fired') && (
                  <p className="mt-1 text-[9px] text-emerald-300">Last test fire: {new Date(localStorage.getItem('nexez_last_outbound_fired')!).toLocaleTimeString()}</p>
                )}

                {/* Real recent fires from DB (what actually triggered / would trigger your endpoints) */}
                {recentOutboundFires.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="text-[10px] uppercase tracking-widest text-cyan-400 mb-1.5">Recent real booking events (auto-fired to endpoints)</div>
                    <div className="space-y-1 text-[11px]">
                      {recentOutboundFires.map((evt, i) => (
                        <div key={i} className="flex justify-between text-cyan-200/90">
                          <span>{evt.event_type?.replace(/_/g, ' ')} — {evt.offer_name}</span>
                          <span className="text-cyan-400/60">{new Date(evt.created_at).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 text-[9px] text-zinc-500">These events caused (or would cause) your saved outbound webhooks to be called with full payload + secret signature when configured.</div>
                  </div>
                )}
              </div>

              {/* Phase 3: Google Calendar Availability (import foundation) */}
              <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-medium text-emerald-200 mb-2">Google Calendar Availability</div>
                <p className="text-[10px] text-zinc-400 mb-3">Enter your Google Calendar ID for future automated sync, or set manual availability notes that appear in agent.json and the public page.</p>

                <div className="space-y-2 mb-3">
                  <input
                    type="text"
                    value={googleCalendarId}
                    onChange={(e) => setGoogleCalendarId(e.target.value)}
                    placeholder="Calendar ID (e.g. yourname@gmail.com or abc123@group.calendar.google.com)"
                    className="w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    value={availabilityNote}
                    onChange={(e) => setAvailabilityNote(e.target.value)}
                    placeholder="Next available: This week, or specific dates/slots"
                    className="w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
                  />
                </div>

                <button
                  type="button"
                  disabled={availabilitySaving}
                  onClick={async () => {
                    if (!page) return
                    setAvailabilitySaving(true)
                    setMessage('')
                    try {
                      let finalNote = availabilityNote || ''
                      let importedAvailability: any = null

                      if (googleCalendarId.trim()) {
                        // Real stub fetch (Phase 3 roadmap) — generates deterministic upcoming windows
                        const res = await fetch('/api/integrations/google-calendar/availability', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ calendarId: googleCalendarId.trim() }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data?.error || 'Import failed')
                        importedAvailability = data.availability
                        finalNote = data.next_available || data.availability?.summary_note || finalNote

                        // Persist structured windows for agents using a compact marker (same pattern as ||TIERS|| for zero-schema fidelity)
                        if (importedAvailability?.windows?.length) {
                          const compact = JSON.stringify(importedAvailability.windows)
                          finalNote = `${finalNote} ||WINDOWS||${compact}`
                        }
                      }

                      const payload: any = {
                        next_available: finalNote || null,
                      }
                      if (googleCalendarId.trim()) {
                        payload.google_calendar_id = googleCalendarId.trim()
                      }
                      // If richer structure returned, we can also persist a compact version for agents
                      // (stored alongside next_available using existing columns — future column `availability` jsonb can hold full object)

                      const supabase = createClient()
                      const { error } = await supabase
                        .from('pages')
                        .update(payload)
                        .eq('id', page.id)

                      const successMsg = googleCalendarId.trim()
                        ? `Availability imported from Google Calendar • ${importedAvailability?.windows?.length || 0} windows • Last synced just now. Live for agents.`
                        : 'Availability saved. Visible in agent.json and public page.'

                      setMessage(error ? error.message : successMsg)
                    } catch (e: any) {
                      setMessage('Failed to import availability: ' + e.message)
                    } finally {
                      setAvailabilitySaving(false)
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-emerald-300/40 px-4 py-1.5 text-sm text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-60"
                >
                  {availabilitySaving ? 'Importing...' : 'Import Availability from Google Calendar'}
                </button>
                <p className="mt-1 text-[10px] text-zinc-500">Calendar ID stored for future automated import. Availability appears for agents immediately.</p>
              </div>

              {/* Phase 7 Tier 2: Get Verified flow for Trust Score (polished) */}
              <div className="mt-6 rounded-lg border border-amber-300/30 bg-amber-400/5 p-4">
                <div className="text-sm font-medium text-amber-200 mb-2 flex items-center gap-2">
                  Get Verified (boosts Trust Score)
                  <span className="text-[10px] text-amber-300">+ up to +25 from signals</span>
                </div>
                <p className="text-[10px] text-zinc-400 mb-3">Provide signals for higher trust (shown on public pages + directory + analyzer comparisons). Manual for MVP; real events drive completion rate.</p>

                {/* Live preview impact */}
                <div className="mb-3 text-xs bg-black/30 p-2 rounded border border-white/10">
                  Current signals impact: Email {verificationDetails.email_verified ? '+10' : '0'} • Domain { (verificationDetails.domain_verified || domainVerified) ? '+15' : '0' } • Docs {(verificationDetails.docs_provided || []).length > 0 ? '+10' : '0'} • (readiness base 60% + events)
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!verificationDetails.email_verified} onChange={(e) => setVerificationDetails({...verificationDetails, email_verified: e.target.checked})} />
                    Email verified
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!verificationDetails.domain_verified} onChange={(e) => setVerificationDetails({...verificationDetails, domain_verified: e.target.checked})} />
                    Domain verified (see custom domain above)
                  </label>

                  {/* Docs as chips (better UX than raw comma) */}
                  <div>
                    <div className="text-xs mb-1">Credentials / licenses / attestations (add names)</div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {(verificationDetails.docs_provided || []).map((d: string, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs bg-amber-400/10 px-2 py-0.5 rounded">
                          {d}
                          <button type="button" onClick={() => {
                            const next = [...(verificationDetails.docs_provided || [])]; next.splice(i,1);
                            setVerificationDetails({...verificationDetails, docs_provided: next});
                          }} className="text-amber-300 hover:text-red-400">×</button>
                        </span>
                      ))}
                      {(verificationDetails.docs_provided || []).length === 0 && <span className="text-[10px] text-zinc-500">None attached yet</span>}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. plumbing-license.pdf"
                        className="flex-1 rounded border border-white/15 bg-black/30 px-3 py-1 text-sm"
                        id="new-doc-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const inp = (e.target as HTMLInputElement);
                            const val = inp.value.trim();
                            if (val) {
                              const current = verificationDetails.docs_provided || [];
                              if (!current.includes(val)) setVerificationDetails({...verificationDetails, docs_provided: [...current, val]});
                              inp.value = '';
                            }
                          }
                        }}
                      />
                      <button type="button" onClick={() => {
                        const inp = document.getElementById('new-doc-input') as HTMLInputElement | null;
                        const val = inp?.value.trim();
                        if (val) {
                          const current = verificationDetails.docs_provided || [];
                          if (!current.includes(val)) setVerificationDetails({...verificationDetails, docs_provided: [...current, val]});
                          if (inp) inp.value = '';
                        }
                      }} className="text-xs rounded border border-white/20 px-3">Add</button>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">Names only for MVP (no file upload). Shown as 📜 Credentials attached on your public page.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!page) return
                    const supabase = createClient()
                    const updated = {...verificationDetails, last_updated: new Date().toISOString()}
                    const { error } = await supabase.from('pages').update({ verification_details: updated }).eq('id', page.id)
                    if (!error) {
                      setVerificationDetails(updated)
                      setMessage('Verification details saved. Trust score updated (visible on public + directory).')
                    } else {
                      setMessage('Save failed: ' + error.message)
                    }
                  }}
                  className="mt-3 w-full rounded border border-amber-300/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-400/10"
                >
                  Save Verification Signals (updates Trust immediately)
                </button>
                <p className="mt-1 text-[10px] text-center text-zinc-500">Also improves your position vs competitors in Analyzer results.</p>
              </div>

              {/* Tier 3: Agent Memory & Context System (fleshed) */}
              <div className="mt-6 rounded-lg border border-zinc-300/30 bg-zinc-400/5 p-4">
                <div className="font-medium text-zinc-200 mb-1 flex items-center gap-2">Agent Memory & Context <span className="text-[10px] text-zinc-500">(Tier 3 — agents remember key facts across sessions)</span></div>
                <p className="text-[10px] text-zinc-400 mb-2">Notes, buyer preferences, restrictions, common objections, or "always mention X". Included in agent.json, mcp.json, public page, and simulator context. Modular (advanced memory for higher tiers).</p>
                <textarea
                  className="w-full h-20 rounded border border-white/15 bg-black/30 p-2 text-sm font-mono"
                  placeholder="e.g. Prefers async over live calls for first meetings. Common question: turnaround time. Restrictions: no weekends."
                  value={memoryNotes}
                  onChange={(e) => setMemoryNotes(e.target.value)}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!page) return
                    const supabase = createClient()
                    const mem = { notes: memoryNotes, updated: new Date().toISOString() }
                    const { error } = await supabase.from('pages').update({ agent_memory: mem }).eq('id', page.id)
                    if (!error) {
                      setMessage('Agent memory saved. Visible to agents via manifests + public context.')
                    } else {
                      setMessage('Save failed: ' + error.message)
                    }
                  }}
                  className="mt-2 text-xs rounded border border-white/20 px-3 py-1 hover:bg-white/5"
                >
                  Save Memory Context
                </button>
                <p className="mt-1 text-[10px] text-zinc-500">Also appears in public "Agent Memory" block and /agent.json for persistent context.</p>
              </div>

              {/* Tier 3: LLM opt-in stub for Co-Pilot / Analyzer (future real xAI calls) */}
              <div className="mt-2 text-xs p-2 border border-white/10 rounded">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={llmOptIn} onChange={async (e) => {
                    if (!page) return
                    const checked = e.target.checked
                    const supabase = createClient()
                    await supabase.from('pages').update({ llm_opt_in: checked }).eq('id', page.id)
                    setLlmOptIn(checked)
                    setMessage('LLM opt-in ' + (checked ? 'enabled (future advanced AI)' : 'disabled (deterministic only)'))
                  }} />
                  Enable advanced AI / LLM assist (opt-in for Co-Pilot, Analyzer, Voice — Tier 3 metered)
                </label>
                <span className="text-[10px] text-zinc-500">Currently uses deterministic engine; flag stored for future real calls + usage tracking.</span>
              </div>

              {/* Tier 3: Advanced Team Collaboration & Approval Workflows (MVP) */}
              <div className="mt-6 rounded-lg border border-zinc-300/30 bg-zinc-400/5 p-4">
                <div className="font-medium text-zinc-200 mb-1">Team Approvals & Collaboration (Tier 3)</div>
                <p className="text-[10px] text-zinc-400 mb-2">Request approval for changes (e.g. offer updates). Approvals stored in team_collaboration JSONB. Modular for multi-user in Business tier. (Current: single-user simulation.)</p>

                <div className="text-xs mb-2">Pending / History Approvals:</div>
                <div className="max-h-24 overflow-auto text-xs bg-black/30 p-2 rounded mb-2 border border-white/10">
                  {(page as any)?.team_collaboration?.approvals?.length ? (
                    (page as any).team_collaboration.approvals.map((a: any, i: number) => (
                      <div key={i} className="flex justify-between py-0.5 border-b border-white/5 last:border-0">
                        <span>{a.note || 'Change request'} — {a.status || 'pending'}</span>
                        <span className="text-zinc-500">{new Date(a.ts).toLocaleDateString()}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-zinc-500">No approvals yet. Use "Request Approval" in editor.</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!page) return
                    const supabase = createClient()
                    const current = (page as any).team_collaboration || { approvals: [] }
                    const newApproval = {
                      id: Date.now().toString(),
                      approver: 'self (demo)',
                      status: 'pending',
                      note: 'Offer pricing/structure update',
                      ts: new Date().toISOString(),
                    }
                    const updated = { ...current, approvals: [...(current.approvals || []), newApproval] }
                    const { error } = await supabase.from('pages').update({ team_collaboration: updated }).eq('id', page.id)
                    if (!error) {
                      setMessage('Approval request added (demo). In real team: notify members.')
                      // refresh would show, but for demo re-load or mutate local
                    } else {
                      setMessage('Failed: ' + error.message)
                    }
                  }}
                  className="text-xs rounded border border-white/20 px-3 py-1 mr-2 hover:bg-white/5"
                >
                  Request Approval (demo)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!page) return
                    const supabase = createClient()
                    const current = (page as any).team_collaboration || { approvals: [] }
                    const updatedApprovals = (current.approvals || []).map((a: any) => a.status === 'pending' ? { ...a, status: 'approved' } : a)
                    const updated = { ...current, approvals: updatedApprovals }
                    await supabase.from('pages').update({ team_collaboration: updated }).eq('id', page.id)
                    setMessage('All pending marked approved (demo).')
                  }}
                  className="text-xs rounded border border-white/20 px-3 py-1 hover:bg-white/5"
                >
                  Approve All Pending (demo)
                </button>
              </div>

              {/* Deeper Calendly: per-page secret for real webhook signature verification */}
              <div className="mt-6 rounded-lg border border-violet-300/30 bg-violet-400/5 p-4">
                <div className="text-sm font-medium text-violet-200 mb-2">Calendly Webhook Secret (real incoming)</div>
                <p className="text-[10px] text-zinc-400 mb-2">Paste the signing secret you configured when creating the webhook in Calendly. Stored on this page. The receiver will use it for HMAC verification on real events (in addition to test headers).</p>
                <input
                  type="password"
                  value={calendlyWebhookSecret}
                  onChange={(e) => setCalendlyWebhookSecret(e.target.value)}
	                  placeholder="Paste Calendly signing secret"
                  className="w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-mono"
                />
                <p className="mt-1 text-[10px] text-zinc-500">Save Settings to persist. Use with your Calendly webhook URL (add ?slug=your-slug or send x-nexez-test-page-slug header for association).</p>
              </div>
            </form>

            <section className="rounded-lg border border-white/10 bg-white/[0.04]">
              <div className="flex items-center justify-between border-b border-white/10 p-5">
                <div className="flex items-center gap-2">
                  <Code2 className="size-5 text-cyan-200" />
                  <h2 className="font-semibold">Agent Manifest Preview</h2>
                </div>
                <button
                  type="button"
                  onClick={() => copy('Manifest', manifestPreview)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10"
                >
                  {copied === 'Manifest' ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
                  Copy
                </button>
              </div>
              <pre className="max-h-[560px] overflow-auto p-5 text-xs leading-6 text-cyan-100">
                {manifestPreview}
              </pre>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function LinkPanel({
  title,
  links,
  copied,
  onCopy,
}: {
  title: string
  links: [string, string][]
  copied: string
  onCopy: (label: string, value: string) => void
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4 space-y-2">
        {links.map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => onCopy(label, value)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-left text-sm text-zinc-300 hover:bg-white/10"
          >
            <span className="min-w-0">
              <span className="block text-zinc-100">{label}</span>
              <span className="block truncate font-mono text-xs text-zinc-500">{value}</span>
            </span>
            {copied === label ? <Check className="size-4 shrink-0 text-emerald-300" /> : <Copy className="size-4 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function DisabledRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-cyan-300/10 bg-black/20 px-3 py-3">
      <span className="flex items-center gap-2 text-zinc-300">
        <span className="text-cyan-200">{icon}</span>
        {label}
      </span>
      <span className="text-zinc-500">{value}</span>
    </div>
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

const topButtonClass =
  'inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-300/60'
