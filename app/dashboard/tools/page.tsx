'use client'

import { useState, useEffect } from 'react'
import { Loader2, ExternalLink, Link2, Wrench } from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import { ApiKeysManager } from '../../../components/ApiKeysManager'
import { StripeImporter, ShopifyImporter, AcuityImporter, SquareImporter } from '../../../components/tools/Importers'
import { CalendlyTool } from '../../../components/tools/CalendlyTool'
import { PlanGate } from '../../../components/billing/PlanGate'
import { usePlan } from '../../../components/billing/PlanProvider'
import { planAllows } from '../../../lib/billing'

type OutboundWebhook = {
  id: string
  url: string
  active: boolean
  secret?: string
  has_secret: boolean
  last_status: string | null
  last_delivery_at: string | null
  created_at: string
}

export default function ToolsPage() {
  const plan = usePlan()
  const outboundWebhooksAllowed = planAllows(plan, 'outboundWebhooks')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  // Account-level outbound webhooks: persisted server-side (DB + RLS) and
  // delivered, HMAC-signed, on supported booking and checkout signals.
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState('')
  const [outboundWebhooks, setOutboundWebhooks] = useState<OutboundWebhook[]>([])
  const [webhookBusy, setWebhookBusy] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [webhookStatus, setWebhookStatus] = useState<Record<string, string>>({})

  async function handleImport() {
    if (!url) return
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ error: 'Failed to analyze site' })
    } finally {
      setLoading(false)
    }
  }

  async function loadWebhooks() {
    try {
      const res = await fetch('/api/dashboard/outbound-webhooks')
      if (!res.ok) return
      const data = await res.json()
      setOutboundWebhooks(Array.isArray(data.webhooks) ? data.webhooks : [])
    } catch {}
  }

  useEffect(() => {
    loadWebhooks()
  }, [])

  async function addWebhook() {
    const value = outboundWebhookUrl.trim()
    if (!value) return
    setWebhookBusy(true)
    setWebhookError(null)
    try {
      const res = await fetch('/api/dashboard/outbound-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWebhookError(data.error || 'Could not add webhook.')
        return
      }
      setOutboundWebhookUrl('')
      if (data.webhook) {
        setOutboundWebhooks((previous) => [data.webhook, ...previous.filter((row) => row.id !== data.webhook.id)])
      }
    } catch {
      setWebhookError('Network error adding webhook.')
    } finally {
      setWebhookBusy(false)
    }
  }

  async function removeWebhook(id: string) {
    await fetch(`/api/dashboard/outbound-webhooks?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    await loadWebhooks()
  }

  async function testWebhook(id: string) {
    setWebhookStatus((prev) => ({ ...prev, [id]: 'Sending…' }))
    try {
      const res = await fetch('/api/dashboard/outbound-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', id }),
      })
      const data = await res.json()
      setWebhookStatus((prev) => ({
        ...prev,
        [id]: data.success ? `Delivered (HTTP ${data.status})` : `Failed: ${data.error || `HTTP ${data.status}`}`,
      }))
      await loadWebhooks()
    } catch {
      setWebhookStatus((prev) => ({ ...prev, [id]: 'Network error' }))
    }
  }


  // Developer Platform + API + Revenue Share (enhanced starter)
  const devPlatformSection = (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
      <h2 className="text-2xl font-semibold">Developer platform &amp; API</h2>
      <p className="mt-2 text-[#9CA3AF]">
        Public agent endpoints plus private management APIs for eligible plans.
      </p>
      <div className="mt-4">
        <ApiKeysManager currentPlan={plan} />
      </div>
      <div className="mt-4 text-sm space-y-1.5">
        <div className="text-zinc-300">Your current settlement commission and transaction economics are shown in Billing.</div>
        <a href="/openapi.json" className="text-[var(--signal)] hover:underline block">OpenAPI spec - full endpoint reference →</a>
        <a href="/agent-pages.json" className="text-[var(--signal)] hover:underline block">Public agent index →</a>
        <a href="/api/directory" className="text-[var(--signal)] hover:underline block">Directory API - readiness &amp; trust signals →</a>
        <a href="/api/public-simulate" className="text-[var(--signal)] hover:underline block">Simulation API - preview how agents read a listing →</a>
      </div>
    </div>
  )

  return (
    <main className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="surface-masthead">
          <p className="surface-eyebrow">Workspace utilities</p>
          <div className="mt-3 flex items-center gap-3">
            <Wrench className="size-7 text-[var(--settings-emphasis)]" aria-hidden="true" />
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tools</h1>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            Import from the web and your favorite tools, then generate an agent-ready listing in minutes.
          </p>
        </header>

        {/* Site Importer */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Site importer</h2>
            <p className="text-[#9CA3AF] mt-1">Paste a website URL and we’ll extract offers, pricing, and FAQs into an editable draft.</p>
          </div>

          <div className="flex gap-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourbusiness.com"
              className="flex-1 input"
            />
            <button
              onClick={handleImport}
              disabled={loading || !url}
              className="btn-primary"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : 'Analyze & Generate'}
            </button>
          </div>

          {result && (
            <div className="mt-8 rounded-xl border border-white/10 bg-black/30 p-6">
              {result.error ? (
                <p className="text-red-400">{result.error}</p>
              ) : (
                <>
                  <p className="text-[var(--ready)] font-medium mb-2">Analysis complete</p>
                  <p className="text-sm text-zinc-400 mb-4">{result.message}</p>
                  {result.structuredOffers?.length > 0 && (
                    <div className="flex gap-4 text-xs text-[#9CA3AF] mb-3">
                      <span>{result.structuredOffers.length} offers detected</span>
                      {typeof result.structuredOffers[0]?.confidence === 'number' && (
                        <span>
                          Avg confidence: {(result.structuredOffers.reduce((s: number, o: any) => s + (o.confidence || 0), 0) / result.structuredOffers.length * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        if (result.suggestedPage) {
                          sessionStorage.setItem('nexez_imported_page', JSON.stringify(result.suggestedPage))
                          if (result.structuredOffers) {
                            sessionStorage.setItem('nexez_imported_structured', JSON.stringify(result.structuredOffers))
                          }
                          window.location.href = '/create?imported=true'
                        }
                      }}
                      className="btn-primary"
                    >
                      Create from Import
                    </button>
                    <a 
                      href={result.suggestedPage?.website_url} 
                      target="_blank" 
                      className="btn-secondary"
                    >
                      View Original Site <ExternalLink className="size-4" />
                    </a>
                  </div>

                  {result.structuredOffers && (
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs uppercase tracking-widest text-[#9CA3AF]">Detected Services</p>
                        {result.structuredOffers.length > 0 && (
                          <span className="text-[10px] text-zinc-500">
                            {result.structuredOffers.length} offers
                            {typeof result.structuredOffers[0]?.confidence === 'number' &&
                              ` • ~${Math.round(
                                (result.structuredOffers.reduce((s: number, o: any) => s + (o.confidence || 0), 0) / result.structuredOffers.length) * 100
                              )}% avg conf`}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {result.structuredOffers.slice(0, 6).map((offer: any, i: number) => (
                          <div key={i} className="text-sm bg-white/[0.03] p-3 rounded flex items-start justify-between gap-3">
                            <div>
                              <span className="font-medium">{offer.name}</span> - {offer.price}
                              {(offer.duration || offer.isMobile || offer.serviceArea) && (
                                <span className="ml-2 text-[10px] text-[var(--signal)]/80">
                                  {offer.duration} {offer.isMobile ? '• Mobile' : ''} {offer.serviceArea ? `• ${offer.serviceArea}` : ''}
                                </span>
                              )}
                            </div>
                            {typeof offer.confidence === 'number' && (
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  offer.confidence >= 0.8
                                    ? 'bg-[var(--ready)]/10 text-[var(--ready)]'
                                    : offer.confidence >= 0.65
                                    ? 'bg-[var(--amber)]/10 text-[var(--amber)]'
                                    : 'bg-white/5 text-zinc-400'
                                }`}
                              >
                                {Math.round(offer.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {result.pagesAnalyzed && result.pagesAnalyzed > 1 && (
                        <p className="mt-2 text-[10px] text-zinc-500">Analyzed across {result.pagesAnalyzed} pages</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-8">
          <PlanGate
            feature="integrations"
            currentPlan={plan}
            variant="tile"
            title="Calendly import & sync"
            description="Import event types, configure signed booking updates, and keep availability synchronized. Available on the Pro plan and up."
          >
            <CalendlyTool />
          </PlanGate>
        </div>

        {/* Import offers from your other connected tools */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-start gap-3 border-b border-white/10 bg-white/[0.015] p-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Link2 className="size-5 text-[var(--signal)]" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Connect more tools</h2>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                Use Pro credentials to import offers from Stripe catalogs, Shopify Admin, Square, and Acuity. The installed Shopify App Store connector is available on every plan.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-[var(--signal)]/25 bg-[var(--signal)]/10 px-2.5 py-0.5 text-[11px] text-[var(--signal)]">Stripe</span>
                <span className="rounded-full border border-[var(--signal)]/25 bg-[var(--signal)]/10 px-2.5 py-0.5 text-[11px] text-[var(--signal)]">Shopify</span>
                <span className="rounded-full border border-[var(--signal)]/25 bg-[var(--signal)]/10 px-2.5 py-0.5 text-[11px] text-[var(--signal)]">Square</span>
                <span className="rounded-full border border-[var(--amber)]/25 bg-[var(--amber)]/10 px-2.5 py-0.5 text-[11px] text-[var(--amber)]">Acuity</span>
              </div>
            </div>
          </div>
          <div className="p-6 pt-4 [&>div:first-child]:mt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:pt-0">
            <PlanGate
              feature="integrations"
              currentPlan={plan}
              variant="tile"
              title="Connect your tools"
              description="Import with manually supplied Stripe, Shopify, Square, and Acuity credentials and keep them synced. Available on Pro and up; installed Shopify OAuth is included on every plan."
            >
              <StripeImporter />
              <ShopifyImporter />
              <SquareImporter />
              <AcuityImporter />
            </PlanGate>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 p-5">
            <div className="font-semibold mb-2 text-[var(--signal)]">What you can connect</div>
            <ul className="text-sm text-[#9CA3AF] space-y-1.5">
              <li>• <span className="text-[var(--ready)]">Calendly</span> - event types, plus webhooks and signing secrets</li>
              <li>• <span className="text-[var(--signal)]">Stripe</span> - products, prices, and live price re-sync</li>
              <li>• <span className="text-[var(--signal)]">Shopify</span> - installed OAuth on every plan, or manual Admin credentials on Pro</li>
              <li>• <span className="text-[var(--signal)]">Square</span> - catalog and booking profiles through OAuth</li>
              <li>• <span className="text-[var(--amber)]">Acuity Scheduling</span> - appointment types for coaching, beauty, and wellness</li>
              <li>• <span className="text-[var(--signal)]">Google Calendar</span> - live free/busy-derived availability through OAuth</li>
              <li>• <span className="text-[var(--signal)]">WooCommerce</span> - read-only products and order visibility</li>
              <li>• <span className="text-[var(--ready)]">ServiceM8</span> - job templates and active job visibility through OAuth</li>
              <li>• Catalog file and website hybrid import</li>
            </ul>
            <p className="mt-3 text-[10px] text-zinc-500">Connected providers can resync from each listing's Settings. One-time imports remain explicitly labeled.</p>
          </div>

          {/* Account-level outbound webhooks for Zapier, Make, and custom automations. */}
          <div className="rounded-xl border border-white/10 p-5">
            <div className="font-semibold mb-2 text-[var(--signal)]">Outbound webhooks</div>
            <p className="text-xs text-[#9CA3AF] mb-3">
              Send confirmed Calendly bookings and checkout signals to a Zapier Catch Hook, Make, or your own URL. Nexez delivers them
              server-side, signed with HMAC-SHA256 (header <code className="text-[var(--ready)]">X-Nexez-Signature: t=…,v1=…</code>).
            </p>

            <PlanGate
              feature="outboundWebhooks"
              currentPlan={plan}
              variant="inline"
              title="Outbound webhooks"
              description="Deliver signed booking and checkout signals to Zapier, Make, or your own URL. Pro plan and up."
            >
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://your-webhook.site/endpoint"
                  className="flex-1 input text-sm"
                  value={outboundWebhookUrl}
                  onChange={(e) => setOutboundWebhookUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addWebhook()
                    }
                  }}
                />
                <button
                  onClick={addWebhook}
                  disabled={webhookBusy || !outboundWebhookUrl.trim()}
                  className="rounded border border-white/20 px-4 text-sm hover:bg-white/5 disabled:opacity-50"
                >
                  {webhookBusy ? <Loader2 className="size-4 animate-spin" /> : 'Add'}
                </button>
              </div>
            </PlanGate>

            {webhookError && <p className="mt-2 text-[11px] text-[var(--amber)]">{webhookError}</p>}

            {outboundWebhooks.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs">
                {outboundWebhooks.map((wh) => (
                  <div key={wh.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[var(--ready)]">{wh.url}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {outboundWebhooksAllowed ? (
                          <button onClick={() => testWebhook(wh.id)} className="text-[10px] text-[var(--signal)] hover:underline">
                            Send test
                          </button>
                        ) : null}
                        <button onClick={() => removeWebhook(wh.id)} className="text-[10px] text-zinc-500 hover:text-[var(--amber)]">
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                      <span>
                        {wh.secret ? (
                          <>Copy this signing secret now: <code className="text-zinc-300">{wh.secret}</code></>
                        ) : wh.has_secret ? (
                          'Signing secret stored securely and shown only when created.'
                        ) : (
                          'No signing secret.'
                        )}
                      </span>
                      {webhookStatus[wh.id] ? (
                        <span className="text-zinc-400">{webhookStatus[wh.id]}</span>
                      ) : wh.last_status ? (
                        <span>
                          Last: {wh.last_status}
                          {wh.last_delivery_at ? ` · ${new Date(wh.last_delivery_at).toLocaleString()}` : ''}
                        </span>
                      ) : (
                        <span>No deliveries yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-zinc-500">
                {outboundWebhooksAllowed
                  ? 'No webhooks yet - add a URL to start receiving signed events.'
                  : 'No retained webhooks to remove.'}
              </p>
            )}
            <p className="mt-3 text-[10px] text-zinc-500">Zapier Catch Hook parses the JSON body. Use Catch Raw Hook when your Zap needs to inspect the signature header.</p>
          </div>
        </div>

        {devPlatformSection}
      </div>
    </main>
  )
}
