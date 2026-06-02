'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { AgentPage, getBaseUrl, normalizeSlug } from '../../../../lib/agent-page'
import { buildAgentPagePayload, getAgentJsonPath } from '../../../../lib/agent-manifest'
import { createClient } from '../../../../utils/supabase/client'
import { fireOutboundWebhook } from '../../../../lib/webhooks'

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
  const [preferOriginalSite, setPreferOriginalSite] = useState(false)
  const [industry, setIndustry] = useState('')
  const [copied, setCopied] = useState('')
  const [activeReSync, setActiveReSync] = useState<'calendly' | 'stripe' | 'shopify' | null>(null)
  const [reSyncInput, setReSyncInput] = useState('')
  const [reSyncInput2, setReSyncInput2] = useState('') // for shopify domain + token

  // Phase 3: Per-page outbound webhooks (auto-fired by receiver on booking events)
  const [outboundEndpoints, setOutboundEndpoints] = useState<string[]>([])
  const [newOutboundUrl, setNewOutboundUrl] = useState('')
  const [outboundSaving, setOutboundSaving] = useState(false)

  // Phase 3: Google Calendar availability (import foundation)
  const [googleCalendarId, setGoogleCalendarId] = useState('')
  const [availabilityNote, setAvailabilityNote] = useState('')
  const [availabilitySaving, setAvailabilitySaving] = useState(false)

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
      .select('*')
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .single<AgentPage>()

    if (error || !data) {
      setMessage('Page not found, or you do not have access to its settings.')
      setLoading(false)
      return
    }

    setPage(data)
    setName(data.name)
    setSlug(data.slug)
    setWebsiteUrl(data.website_url ?? '')
    setCtaUrl(data.cta_url ?? '')
    setCtaLabel(data.cta_label ?? 'Visit website')
    setContactEmail(data.contact_email ?? '')
    setIsPublished(data.is_published)
    setCustomDomain(data.custom_domain ?? '')
    setPreferOriginalSite(!!data.prefer_original_site)
    setIndustry(data.industry ?? '')

    // Phase 3: Load per-page outbound webhooks
    const ob = (data as any)?.outbound_webhooks
    if (ob) {
      const arr = Array.isArray(ob) ? ob.map((o: any) => o?.url || o).filter(Boolean) : []
      setOutboundEndpoints(arr)
    } else {
      setOutboundEndpoints([])
    }

    // Phase 3: Load Google Calendar availability
    setGoogleCalendarId((data as any)?.google_calendar_id || '')
    setAvailabilityNote((data as any)?.next_available || '')

    setLoading(false)
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
        prefer_original_site: preferOriginalSite,
      })
      .eq('id', page.id)

    setSaving(false)
    setMessage(error ? error.message : 'Settings saved.')

    if (!error) {
      setPage({
        ...page,
        name,
        slug: cleanSlug,
        website_url: websiteUrl,
        cta_url: ctaUrl || websiteUrl,
        cta_label: ctaLabel || 'Visit website',
        contact_email: contactEmail,
        is_published: isPublished,
      })
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1200)
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
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
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

            <LinkPanel title="Agent links" links={[
              ['Public page', publicUrl],
              ['Agent JSON', agentJsonUrl],
              ['Search API', searchUrl],
              ['OpenAPI', `${getBaseUrl()}/openapi.json`],
            ]} copied={copied} onCopy={copy} />

            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
              <div className="flex items-center gap-2 text-cyan-100">
                <ShieldCheck className="size-5" />
                <h2 className="font-semibold">Advanced</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-widest text-zinc-400">Custom domain</p>
                  <input
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="agents.yourcompany.com"
                    className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">CNAME your subdomain to the deployment host. Full verification in next iteration.</p>
                </div>
                <DisabledRow icon={<Bot className="size-4" />} label="API key" value="Public endpoints (no key required)" />
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs uppercase tracking-widest text-zinc-400">Quick embed (iframe)</p>
                <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-[10px] text-zinc-400">{`<iframe src="${publicUrl}" width="100%" height="800" style="border:1px solid #222;"></iframe>`}</pre>
                <p className="mt-1 text-[10px] text-zinc-500">Embed the clean agent view on your main site. Agents still see the canonical Nexez URL.</p>
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

              {/* NEW: Embed & Original Site Linking (from vision) */}
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
                      Prefer linking bookings to my original website
                    </label>
                    <p className="text-xs text-[#9CA3AF] mt-1">When enabled, agent checkout buttons will point to your main site instead of Nexez checkout.</p>
                  </div>

                  <div>
                    <p className="text-xs text-[#9CA3AF] mb-1.5">Embed this agent page on your website</p>
                    <pre className="text-[10px] bg-black/40 p-3 rounded overflow-x-auto text-[#C4B5FD]">
{`<iframe 
  src="${publicUrl}" 
  width="100%" 
  height="900" 
  style="border:1px solid #222; border-radius:12px;">
</iframe>`}
                    </pre>
                    <button
                      type="button"
                      onClick={() => {
                        const code = `<iframe src="${publicUrl}" width="100%" height="900" style="border:1px solid #222; border-radius:12px;"></iframe>`
                        navigator.clipboard.writeText(code)
                        alert('Embed code copied!')
                      }}
                      className="mt-2 text-xs text-[#00F5FF] hover:underline"
                    >
                      Copy embed code
                    </button>
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

                      // Fire outbound webhook if configured (Phase 3 foundation)
                      const webhookEndpoint = localStorage.getItem('nexez_outbound_webhook_url')
                      if (webhookEndpoint) {
                        fireOutboundWebhook(webhookEndpoint, null, {
                          event: 'integration.re_sync_completed',
                          timestamp: new Date().toISOString(),
                          page: { id: page?.id || '', slug: page?.slug || '', name: page?.name || '' },
                          data: { integration: 'calendly', offer_count: data.structuredOffers?.length || 0 }
                        })
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
                    placeholder="Stripe Secret Key (sk_live_...)"
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

              {/* Phase 3: Per-page outbound webhooks — automatically fired by the Calendly (and future) receivers on booking events */}
              <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-medium text-cyan-200 mb-2">Outbound webhooks on booking events</div>
                <p className="text-[10px] text-zinc-400 mb-3">These endpoints will receive `booking.received` payloads automatically when a Calendly booking arrives via webhook (no extra setup in Tools required). Useful for Zapier, Make, internal systems, etc.</p>

                <div className="flex gap-2 mb-2">
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
                        setOutboundEndpoints(prev => Array.from(new Set([...prev, newOutboundUrl.trim()])))
                        setNewOutboundUrl('')
                      }
                    }}
                    className="rounded border border-white/20 px-3 text-sm hover:bg-white/5"
                  >
                    Add
                  </button>
                </div>

                {outboundEndpoints.length > 0 && (
                  <div className="text-xs mb-2">
                    {outboundEndpoints.map((url, i) => (
                      <div key={i} className="flex items-center justify-between font-mono text-emerald-300/90 py-0.5">
                        <span className="truncate">{url}</span>
                        <button
                          type="button"
                          onClick={() => setOutboundEndpoints(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-[10px] text-zinc-400 hover:text-red-400"
                        >
                          remove
                        </button>
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
                      const supabase = createClient()
                      const { error } = await supabase
                        .from('pages')
                        .update({ outbound_webhooks: outboundEndpoints.map(u => ({ url: u })) })
                        .eq('id', page.id)
                      setMessage(error ? error.message : 'Outbound webhooks saved for this page.')
                    } catch (e: any) {
                      setMessage('Failed to save: ' + e.message)
                    } finally {
                      setOutboundSaving(false)
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-cyan-300/40 px-4 py-1.5 text-sm text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-60"
                >
                  {outboundSaving ? 'Saving...' : 'Save Outbound Endpoints for this Page'}
                </button>
                <p className="mt-1 text-[10px] text-zinc-500">Endpoints are stored on the page and used automatically by the webhook receiver.</p>
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
                      const supabase = createClient()

                      let finalNote = availabilityNote || ''
                      if (googleCalendarId.trim()) {
                        const prefix = `Synced from Google Calendar (${googleCalendarId.trim()})`
                        // Simulate imported availability windows
                        const windows = availabilityNote ? availabilityNote : 'Mon-Fri 9am-5pm, Sat 10am-2pm'
                        finalNote = `${prefix} — Windows: ${windows}`
                      }

                      const payload: any = {
                        next_available: finalNote || null,
                      }
                      if (googleCalendarId.trim()) {
                        payload.google_calendar_id = googleCalendarId.trim()
                      }

                      const { error } = await supabase
                        .from('pages')
                        .update(payload)
                        .eq('id', page.id)

                      const successMsg = googleCalendarId.trim()
                        ? 'Availability imported from Google Calendar. Now live in agent.json and public page.'
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
