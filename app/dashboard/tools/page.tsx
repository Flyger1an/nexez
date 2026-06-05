'use client'

import { useState, useEffect } from 'react'
import { Bot, Loader2, ExternalLink, Link2 } from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import { ApiKeysManager } from '../../../components/ApiKeysManager'
import { StripeImporter, ShopifyImporter, AcuityImporter } from '../../../components/tools/Importers'
import { CalendlyTool } from '../../../components/tools/CalendlyTool'

export default function ToolsPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  // Developer platform — API keys are managed via <ApiKeysManager />
  const revenueShare = 15 // % on agent-driven transactions

  // Outbound webhook config (supports multiple)
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState('')
  const [outboundWebhooks, setOutboundWebhooks] = useState<string[]>([])

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

  useEffect(() => {
    try {
      const savedList = localStorage.getItem('nexez_outbound_webhooks')
      if (savedList) {
        setOutboundWebhooks(JSON.parse(savedList))
      }
    } catch {}
  }, [])


  // Tier 3 Developer Platform + API + Revenue Share (enhanced starter)
  const devPlatformSection = (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
      <h2 className="text-2xl font-semibold">Developer platform &amp; API</h2>
      <p className="mt-2 text-[#9CA3AF]">
        Public APIs and agent endpoints, plus revenue share on agent-driven sales.
      </p>
      <div className="mt-4">
        <ApiKeysManager />
      </div>
      <div className="mt-4 text-sm space-y-1.5">
        <div className="text-zinc-300">Revenue share: {revenueShare}% on agent-driven transactions.</div>
        <a href="/openapi.json" className="text-[#00F5FF] hover:underline block">OpenAPI spec — full endpoint reference →</a>
        <a href="/agent-pages.json" className="text-[#00F5FF] hover:underline block">Public agent index →</a>
        <a href="/api/directory" className="text-[#00F5FF] hover:underline block">Directory API — readiness &amp; trust signals →</a>
        <a href="/api/public-simulate" className="text-[#00F5FF] hover:underline block">Simulation API — preview how agents read a page →</a>
        <div className="text-xs text-zinc-500 mt-2">
          Outbound webhooks are live today. Programmatic key management and payouts are on the way.
        </div>
      </div>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center gap-3 mb-4">
          <Bot className="size-8 text-[#7C3AED]" />
          <h1 className="text-4xl font-semibold tracking-tight">Tools</h1>
        </div>
        <p className="text-xl text-[#9CA3AF]">
          Import from the web and your favorite tools, then generate an agent-ready page in minutes.
        </p>

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
                  <p className="text-emerald-400 font-medium mb-2">Analysis complete</p>
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
                              <span className="font-medium">{offer.name}</span> — {offer.price}
                              {(offer.duration || offer.isMobile || offer.serviceArea) && (
                                <span className="ml-2 text-[10px] text-cyan-300/80">
                                  {offer.duration} {offer.isMobile ? '• Mobile' : ''} {offer.serviceArea ? `• ${offer.serviceArea}` : ''}
                                </span>
                              )}
                            </div>
                            {typeof offer.confidence === 'number' && (
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  offer.confidence >= 0.8
                                    ? 'bg-emerald-400/10 text-emerald-300'
                                    : offer.confidence >= 0.65
                                    ? 'bg-amber-400/10 text-amber-300'
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

        <CalendlyTool />

        {/* Import offers from your other connected tools */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-start gap-3 border-b border-white/10 bg-white/[0.015] p-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Link2 className="size-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Connect more tools</h2>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                Import offers from Stripe, Shopify, and Acuity — each becomes an editable, agent-ready page.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-0.5 text-[11px] text-cyan-200">Stripe</span>
                <span className="rounded-full border border-purple-300/25 bg-purple-300/10 px-2.5 py-0.5 text-[11px] text-purple-200">Shopify</span>
                <span className="rounded-full border border-orange-300/25 bg-orange-300/10 px-2.5 py-0.5 text-[11px] text-orange-200">Acuity</span>
              </div>
            </div>
          </div>
          <div className="p-6 pt-4 [&>div:first-child]:mt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:pt-0">
            <StripeImporter />
            <ShopifyImporter />
            <AcuityImporter />
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 p-5">
            <div className="font-semibold mb-2 text-cyan-300">What you can connect</div>
            <ul className="text-sm text-[#9CA3AF] space-y-1.5">
              <li>• <span className="text-emerald-300">Calendly</span> — event types, plus webhooks and signing secrets</li>
              <li>• <span className="text-cyan-300">Stripe</span> — products, prices, and live price re-sync</li>
              <li>• <span className="text-purple-300">Shopify / Woo</span> — product catalog via the public feed</li>
              <li>• <span className="text-pink-300">Square</span> — bookings and payments for mobile, wellness, and home services</li>
              <li>• <span className="text-orange-300">Acuity Scheduling</span> — appointment types for coaching, beauty, and wellness</li>
              <li>• <span className="text-blue-300">Google Calendar</span> — availability windows</li>
              <li>• CSV and website hybrid import</li>
            </ul>
            <p className="mt-3 text-[10px] text-zinc-500">Connect once, then keep your pages fresh for agents automatically.</p>
          </div>

          {/* Outbound webhooks (Zapier / Make / generic) */}
          <div className="rounded-xl border border-white/10 p-5">
            <div className="font-semibold mb-2 text-cyan-300">Outbound webhooks</div>
            <p className="text-xs text-[#9CA3AF] mb-3">Fire a webhook to Zapier, Make, or any endpoint when a booking arrives or an integration re-syncs. Add and test your endpoints below.</p>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://your-webhook.site/endpoint"
                className="flex-1 input text-sm"
                value={outboundWebhookUrl}
                onChange={(e) => setOutboundWebhookUrl(e.target.value)}
              />
              <button
                onClick={() => {
                  if (outboundWebhookUrl.trim()) {
                    const newList = [...outboundWebhooks, outboundWebhookUrl.trim()]
                    const uniqueList = Array.from(new Set(newList))
                    setOutboundWebhooks(uniqueList)
                    localStorage.setItem('nexez_outbound_webhooks', JSON.stringify(uniqueList))
                    setOutboundWebhookUrl('')
                  }
                }}
                className="rounded border border-white/20 px-4 text-sm hover:bg-white/5"
              >
                Add
              </button>
            </div>

            {outboundWebhooks.length > 0 && (
              <div className="mt-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-zinc-400">Configured endpoints:</span>
                  <button
                    onClick={async () => {
                      const payload = {
                        event: 'test.webhook',
                        timestamp: new Date().toISOString(),
                        data: { message: 'Test from Nexez Tools' }
                      }
                      for (const url of outboundWebhooks) {
                        await fetch(url, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload)
                        }).catch(() => {})
                      }
                      alert(`Test sent to ${outboundWebhooks.length} endpoint(s).`)
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300"
                  >
                    Send Test
                  </button>
                  <button
                    onClick={async () => {
                      // Phase 3: Route through the real Calendly receiver so it records checkout_event + last_booking (if page) + fires outbounds.
                      // This exercises the full durable + outbound chain for demo purposes.
                      try {
                        const demoSecret = `nexez-test-${Date.now()}`
                        const recHeaders: Record<string, string> = {
                          'Content-Type': 'application/json',
                          'x-nexez-test-secret': demoSecret,
                          'x-nexez-test-page-slug': 'demo',
                          'x-nexez-test-mode': 'true',
                        }
                        if (outboundWebhooks.length > 0) {
                          recHeaders['x-nexez-outbound-endpoints'] = JSON.stringify(outboundWebhooks)
                        }
                        const recPayload = {
                          event: 'invitee.created',
                          payload: {
                            invitee: { name: 'Test User', email: 'test@example.com' },
                            event: { name: 'Test Consultation (via outbound test)', start_time: new Date().toISOString() },
                          },
                        }
                        await fetch('/api/webhooks/calendly', {
                          method: 'POST',
                          headers: recHeaders,
                          body: JSON.stringify(recPayload),
                        }).catch(() => {})
                      } catch {}

                      // Also direct (original demo behavior)
                      const payload = {
                        event: 'booking.received',
                        timestamp: new Date().toISOString(),
                        page: { slug: 'demo-page' },
                        data: {
                          integration: 'calendly',
                          event_name: 'Test Consultation',
                          invitee_name: 'Test User',
                          start_time: new Date().toISOString()
                        }
                      }
                      for (const url of outboundWebhooks) {
                        await fetch(url, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload)
                        }).catch(() => {})
                      }
                      alert(`Booking received event sent to ${outboundWebhooks.length} endpoint(s) (full receiver path exercised).`)
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 ml-2"
                  >
                    Test Booking Event
                  </button>
                </div>
                {outboundWebhooks.map((url, idx) => (
                  <div key={idx} className="font-mono text-emerald-300 truncate">{url}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {devPlatformSection}
      </div>
    </main>
  )
}
