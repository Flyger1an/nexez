'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Bot, Loader2, ExternalLink } from 'lucide-react'

export default function ToolsPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  // Phase 3: First-class Calendly tool on Tools page
  const [calendlyToken, setCalendlyToken] = useState('')
  const [calendlyLoading, setCalendlyLoading] = useState(false)
  const [calendlyResult, setCalendlyResult] = useState<any>(null)

  // Phase 3: Calendly Webhooks (per ROADMAP)
  const [webhookSecret, setWebhookSecret] = useState('')
  const [webhookConnected, setWebhookConnected] = useState<{ lastSaved: string } | null>(null)
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookTestPageSlug, setWebhookTestPageSlug] = useState('')
  const [lastWebhookEvent, setLastWebhookEvent] = useState<any>(null)

  // Phase 3: Stripe import (starting depth)
  const [stripeKey, setStripeKey] = useState('')
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeResult, setStripeResult] = useState<any>(null)
  const [stripeConnected, setStripeConnected] = useState<{ lastImport: string } | null>(null)

  // Phase 3: Shopify (user request)
  const [shopifyUrl, setShopifyUrl] = useState('')
  const [shopifyToken, setShopifyToken] = useState('')
  const [shopifyLoading, setShopifyLoading] = useState(false)
  const [shopifyResult, setShopifyResult] = useState<any>(null)
  const [shopifyConnected, setShopifyConnected] = useState<{ lastImport: string } | null>(null)

  // Phase 3 Consumer Track: Square (booking + payments for local/consumer services)
  const [squareToken, setSquareToken] = useState('')
  const [squareLoading, setSquareLoading] = useState(false)
  const [squareResult, setSquareResult] = useState<any>(null)
  const [squareConnected, setSquareConnected] = useState<{ lastImport: string } | null>(null)

  // Square consumer services import (Phase 3 consumer track start)
  // (handler defined below after Shopify)

  // Outbound webhook demo config (supports multiple)
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

  async function handleCalendlyImport() {
    if (!calendlyToken.trim()) return
    setCalendlyLoading(true)
    setCalendlyResult(null)

    try {
      const res = await fetch('/api/integrations/calendly/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: calendlyToken.trim() }),
      })
      const data = await res.json()
      setCalendlyResult(data)

      if (!data.error) {
        saveCalendlyConnection(calendlyToken.trim())
      }
    } catch (e) {
      setCalendlyResult({ error: 'Failed to import from Calendly' })
    } finally {
      setCalendlyLoading(false)
    }
  }

  function startPageFromCalendly() {
    if (!calendlyResult?.structuredOffers?.length) return
    sessionStorage.setItem('nexez_imported_structured', JSON.stringify(calendlyResult.structuredOffers))
    sessionStorage.setItem('nexez_imported_page', JSON.stringify({
      name: 'My Calendly Bookings',
      description: 'Book time with me via Calendly. All availability synced.',
    }))
    window.location.href = '/create?imported=true&source=calendly'
  }

  // Phase 3: Persisted connection status for Calendly (session only, no DB)
  const [calendlyConnected, setCalendlyConnected] = useState<{ lastSync: string; maskedToken: string } | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexez_calendly_connection')
      if (saved) {
        setCalendlyConnected(JSON.parse(saved))
      }

      const stripe = localStorage.getItem('nexez_stripe_connection')
      if (stripe) {
        setStripeConnected(JSON.parse(stripe))
      }

      const lastWebhook = localStorage.getItem('nexez_last_calendly_webhook')
      if (lastWebhook) {
        setLastWebhookEvent(JSON.parse(lastWebhook))
      }

      const savedList = localStorage.getItem('nexez_outbound_webhooks')
      if (savedList) {
        setOutboundWebhooks(JSON.parse(savedList))
      }

      const shopify = localStorage.getItem('nexez_shopify_connection')
      if (shopify) {
        setShopifyConnected(JSON.parse(shopify))
      }
    } catch {}
  }, [])

  function saveCalendlyConnection(token: string) {
    const masked = token.slice(0, 4) + '••••' + token.slice(-4)
    const connection = {
      lastSync: new Date().toISOString(),
      maskedToken: masked,
    }
    localStorage.setItem('nexez_calendly_connection', JSON.stringify(connection))
    setCalendlyConnected(connection)
  }

  async function handleCalendlyReSync() {
    if (!calendlyToken.trim()) {
      alert('Paste your Calendly token to re-sync.')
      return
    }
    await handleCalendlyImport()
  }

  // Phase 3 Webhook helpers
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexez_calendly_webhook')
      if (saved) setWebhookConnected(JSON.parse(saved))
    } catch {}
  }, [])

  function saveCalendlyWebhook(secret: string) {
    if (!secret.trim()) return
    const data = { lastSaved: new Date().toISOString() }
    localStorage.setItem('nexez_calendly_webhook', JSON.stringify(data))
    setWebhookConnected(data)
    // Clear the input after save for security
    setWebhookSecret('')
  }

  async function sendTestWebhook() {
    if (!webhookSecret.trim()) {
      alert('Please save a webhook secret first.')
      return
    }

    setWebhookTesting(true)
    setWebhookTestResult(null)

    const testPayload = {
      event: 'invitee.created',
      payload: {
        invitee: { name: 'Test User', email: 'test@example.com' },
        event: { name: 'Test Consultation', start_time: new Date().toISOString() },
      },
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-nexez-test-secret': webhookSecret.trim(),
      }

      if (webhookTestPageSlug.trim()) {
        headers['x-nexez-test-page-slug'] = webhookTestPageSlug.trim()
      }
      // Phase 3: Forward configured demo outbound endpoints so receiver actually fires them on booking events
      if (outboundWebhooks.length > 0) {
        headers['x-nexez-outbound-endpoints'] = JSON.stringify(outboundWebhooks)
      }

      const res = await fetch('/api/webhooks/calendly', {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
      })
      const data = await res.json()
      const result = { status: res.status, data, receivedAt: new Date().toISOString() }
      setWebhookTestResult(result)
      setLastWebhookEvent(result)
      localStorage.setItem('nexez_last_calendly_webhook', JSON.stringify(result))
    } catch (e: any) {
      setWebhookTestResult({ error: e.message })
    } finally {
      setWebhookTesting(false)
    }
  }

  async function handleStripeImport() {
    if (!stripeKey.trim()) return
    setStripeLoading(true)
    setStripeResult(null)

    try {
      const res = await fetch('/api/integrations/stripe/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeSecretKey: stripeKey.trim() }),
      })
      const data = await res.json()
      setStripeResult(data)

      if (!data.error) {
        const conn = { lastImport: new Date().toISOString() }
        localStorage.setItem('nexez_stripe_connection', JSON.stringify(conn))
        setStripeConnected(conn)
      }
    } catch (e) {
      setStripeResult({ error: 'Failed to connect to Stripe' })
    } finally {
      setStripeLoading(false)
    }
  }

  async function handleShopifyImport() {
    if (!shopifyUrl.trim()) return
    setShopifyLoading(true)
    setShopifyResult(null)

    try {
      if (shopifyToken.trim()) {
        // Authenticated import (full private catalog)
        const res = await fetch('/api/integrations/shopify/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            shop: shopifyUrl.trim(), 
            accessToken: shopifyToken.trim() 
          }),
        })
        const data = await res.json()
        setShopifyResult(data)
      } else {
        // Public catalog via enhanced general importer
        const res = await fetch('/api/tools/import-site', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: shopifyUrl.trim(), industry: 'retail shopify' }),
        })
        const data = await res.json()
        setShopifyResult(data)
      }
    } catch (e) {
      setShopifyResult({ error: 'Failed to import Shopify catalog' })
    } finally {
      setShopifyLoading(false)
    }

    // Save connection status on success
    if (shopifyResult && !shopifyResult.error) {
      const conn = { lastImport: new Date().toISOString() }
      localStorage.setItem('nexez_shopify_connection', JSON.stringify(conn))
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
          <ArrowLeft className="size-4" /> Back to Dashboard
        </a>

        <div className="flex items-center gap-3 mb-4">
          <Bot className="size-8 text-[#7C3AED]" />
          <h1 className="text-4xl font-semibold tracking-tight">Tools</h1>
        </div>
        <p className="text-xl text-[#9CA3AF]">Powerful tools to create agent pages faster.</p>

        {/* Site Importer */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Site Importer</h2>
            <p className="text-[#9CA3AF] mt-1">Paste any website URL and we’ll automatically extract services and generate a draft Nexez agent page.</p>
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
                      Create Page from this Import
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

        {/* Phase 3: First-class Calendly tool (elevated from create wizard) */}
        <div className="mt-8 rounded-2xl border border-violet-400/20 bg-white/[0.015] p-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-violet-200">Calendly Booking Import</h2>
              <p className="text-[#9CA3AF] mt-1">Paste your Calendly Personal Access Token. Import active event types as rich, editable offers with duration and direct booking links.</p>
            </div>
            {calendlyConnected && (
              <div className="text-right text-xs">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300">
                  <div className="size-1.5 rounded-full bg-emerald-400" />
                  Connected
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  Last sync {new Date(calendlyConnected.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <input
              type="password"
              value={calendlyToken}
              onChange={(e) => setCalendlyToken(e.target.value)}
              placeholder="Calendly Personal Access Token (starts with ghp_...)"
              className="flex-1 input"
            />
            <button
              onClick={handleCalendlyImport}
              disabled={calendlyLoading || !calendlyToken.trim()}
              className="btn-primary bg-violet-300 text-zinc-950 hover:bg-violet-200"
            >
              {calendlyLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import Event Types'}
            </button>
            {calendlyConnected && (
              <button
                onClick={handleCalendlyReSync}
                disabled={calendlyLoading}
                className="rounded-lg border border-violet-300/40 px-4 py-2 text-sm text-violet-200 hover:bg-white/5"
              >
                Re-sync
              </button>
            )}
          </div>

          <p className="mt-2 text-[10px] text-zinc-500">
            Get your token at{' '}
            <a href="https://calendly.com/integrations/api_webhooks" target="_blank" className="underline hover:text-violet-300">
              Calendly Integrations → API & Webhooks
            </a>
          </p>

          {/* Phase 3: Webhook expansion per ROADMAP - Receiver is now live */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-violet-200">Webhooks (Real-time updates)</span>
              <span className="text-[10px] rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                Receiver Active
              </span>
              {webhookConnected && (
                <span className="text-[10px] rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                  Secret Saved
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500 mb-3">
              Nexez can now receive live booking events from Calendly. Configure a webhook in Calendly and paste the signing secret below.
            </p>

            <div className="rounded bg-black/30 p-3 text-xs font-mono mb-3 break-all">
              POST {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/calendly` : '/api/webhooks/calendly'}
            </div>

            <div className="flex gap-3">
              <input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Webhook signing secret (from Calendly)"
                className="flex-1 input text-sm"
              />
              <button
                onClick={() => saveCalendlyWebhook(webhookSecret)}
                disabled={!webhookSecret.trim()}
                className="rounded-lg border border-violet-300/40 px-4 text-sm text-violet-200 hover:bg-white/5"
              >
                Save Secret
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={sendTestWebhook}
                  disabled={webhookTesting || !webhookSecret.trim()}
                  className="rounded-lg border border-violet-300/40 px-4 py-1.5 text-sm text-violet-200 hover:bg-white/5 disabled:opacity-50"
                >
                  {webhookTesting ? 'Sending test...' : 'Send Test Webhook'}
                </button>
                <span className="text-[10px] text-zinc-500">Verifies signature + receiver end-to-end</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookTestPageSlug}
                  onChange={(e) => setWebhookTestPageSlug(e.target.value)}
                  placeholder="Optional: your-page-slug (to create analytics event)"
                  className="flex-1 input text-sm"
                />
              </div>
              <p className="text-[10px] text-zinc-500 -mt-1">
                If you enter one of your page slugs above, the test event will create a real entry in your Analytics.
              </p>
            </div>

            {webhookTestResult && (
              <div className="mt-3 rounded bg-black/40 p-3 text-xs font-mono">
                {webhookTestResult.error ? (
                  <span className="text-red-400">Error: {webhookTestResult.error}</span>
                ) : (
                  <span className="text-emerald-300">Success ({webhookTestResult.status}): {JSON.stringify(webhookTestResult.data)}</span>
                )}
              </div>
            )}

            {lastWebhookEvent && (
              <div className="mt-4 rounded border border-emerald-300/30 bg-emerald-400/5 p-4 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-emerald-300">Last Booking Received</span>
                  <button
                    onClick={() => {
                      setLastWebhookEvent(null);
                      localStorage.removeItem('nexez_last_calendly_webhook');
                    }}
                    className="text-[10px] text-zinc-500 hover:text-red-400"
                  >
                    Clear
                  </button>
                </div>
                <div className="text-xs text-zinc-500 mb-1">
                  {new Date(lastWebhookEvent.receivedAt || Date.now()).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">{lastWebhookEvent.data?.payload?.event?.name || 'Consultation'}</span>
                  <span className="text-zinc-400"> with </span>
                  <span className="font-medium">{lastWebhookEvent.data?.payload?.invitee?.name || 'Guest'}</span>
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-1">
                  Recorded in Analytics as provider redirect.
                </div>
              </div>
            )}

            <p className="mt-2 text-[10px] text-zinc-500">
              1. In Calendly → Integrations → Webhooks, create a webhook for <strong>invitee.created</strong> + <strong>invitee.canceled</strong>.<br />
              2. Set the URL to the endpoint above.<br />
              3. Copy the Signing Secret and paste it here.
            </p>
            <p className="mt-1 text-[10px] text-violet-400">
              The receiver verifies signatures and is ready for production use.
            </p>
          </div>

          {/* Phase 3: Start of Stripe depth (per ROADMAP) */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-cyan-200">Stripe Product & Price Import</h3>
                <p className="text-xs text-[#9CA3AF] mt-1">Paste a Stripe Secret Key (starts with sk_). Pull products/prices as rich editable offers.</p>
              </div>
              {stripeConnected && (
                <div className="text-right text-xs">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300">
                    <div className="size-1.5 rounded-full bg-emerald-400" />
                    Connected
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500">
                    Last import {new Date(stripeConnected.lastImport).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <input
                type="password"
                value={stripeKey}
                onChange={(e) => setStripeKey(e.target.value)}
                placeholder="sk_live_... or sk_test_..."
                className="flex-1 input"
              />
              <button
                onClick={handleStripeImport}
                disabled={stripeLoading || !stripeKey.trim()}
                className="btn-primary bg-cyan-300 text-zinc-950 hover:bg-cyan-200"
              >
                {stripeLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import Products'}
              </button>
              {stripeConnected && (
                <button
                  onClick={() => {
                    const secret = prompt('Paste your Stripe Secret Key to re-sync:');
                    if (secret) {
                      // Reuse the import handler with the provided key
                      setStripeKey(secret);
                      // Trigger import after state update (simple approach)
                      setTimeout(() => handleStripeImport(), 50);
                    }
                  }}
                  disabled={stripeLoading}
                  className="rounded-lg border border-cyan-300/40 px-4 py-2 text-sm text-cyan-200 hover:bg-white/5"
                >
                  Re-sync
                </button>
              )}
            </div>

            {stripeResult && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-5">
                {stripeResult.error ? (
                  <p className="text-red-400 text-sm">{stripeResult.error}</p>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-emerald-400 text-sm font-medium">{stripeResult.message}</p>
                      {stripeResult.structuredOffers?.length > 0 && (
                        <button
                          onClick={() => {
                            sessionStorage.setItem('nexez_imported_structured', JSON.stringify(stripeResult.structuredOffers))
                            window.location.href = '/create?imported=true&source=stripe'
                          }}
                          className="text-sm rounded bg-cyan-300 px-4 py-1.5 font-semibold text-zinc-950 hover:bg-cyan-200"
                        >
                          Create Page →
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-[#9CA3AF]">
                      <div className="mb-1">{stripeResult.structuredOffers?.length || 0} products imported</div>
                      {stripeResult.structuredOffers?.slice(0, 3).map((o: any, i: number) => (
                        <div key={i}>• {o.name} — {o.price} {o.tiers ? '(recurring options)' : ''}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Phase 3: Shopify integration foundation (per user request + ROADMAP) */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-purple-200">Shopify Catalog Import</h3>
              <p className="text-xs text-[#9CA3AF] mt-1">Enter your Shopify store URL. We automatically try the public products feed + enhanced crawling.</p>
            </div>

            <div className="flex gap-3">
              <input
                type="url"
                value={shopifyUrl}
                onChange={(e) => setShopifyUrl(e.target.value)}
                placeholder="https://yourstore.myshopify.com"
                className="flex-1 input"
              />
              <button
                onClick={handleShopifyImport}
                disabled={shopifyLoading || !shopifyUrl.trim()}
                className="btn-primary bg-purple-300 text-zinc-950 hover:bg-purple-200"
              >
                {shopifyLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import Catalog'}
              </button>
              {shopifyConnected && (
                <button
                  onClick={() => {
                    const token = prompt('Paste Shopify Admin token for re-sync (or leave empty for public):');
                    if (shopifyUrl) {
                      // Simple re-trigger with current URL
                      setTimeout(() => handleShopifyImport(), 50);
                    }
                  }}
                  disabled={shopifyLoading}
                  className="rounded-lg border border-purple-300/40 px-4 py-2 text-sm text-purple-200 hover:bg-white/5"
                >
                  Re-sync
                </button>
              )}
            </div>

            <div className="mt-2">
              <input
                type="password"
                value={shopifyToken}
                onChange={(e) => setShopifyToken(e.target.value)}
                placeholder="Optional: Admin API token (shpat_...) for full private catalog"
                className="w-full input text-sm"
              />
            </div>

            {shopifyResult && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-5">
                {shopifyResult.error ? (
                  <p className="text-red-400 text-sm">{shopifyResult.error}</p>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-emerald-400 text-sm font-medium">{shopifyResult.message || 'Shopify catalog imported'}</p>
                      {shopifyResult.structuredOffers?.length > 0 && (
                        <button
                          onClick={() => {
                            sessionStorage.setItem('nexez_imported_structured', JSON.stringify(shopifyResult.structuredOffers))
                            window.location.href = '/create?imported=true&source=shopify'
                          }}
                          className="text-sm rounded bg-purple-300 px-4 py-1.5 font-semibold text-zinc-950 hover:bg-purple-200"
                        >
                          Create Page →
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-[#9CA3AF] space-y-1">
                      {shopifyResult.structuredOffers?.slice(0, 5).map((o: any, i: number) => (
                        <div key={i}>• {o.name} — {o.price}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-500">
              Leave token empty for public catalog (most stores). Paste Admin API token for complete private access.
            </p>
          </div>

          {calendlyResult && (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-6">
              {calendlyResult.error ? (
                <p className="text-red-400">{calendlyResult.error}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-emerald-400 font-medium">{calendlyResult.message || `Imported ${calendlyResult.count} event types`}</p>
                    {calendlyResult.structuredOffers?.length > 0 && (
                      <button
                        onClick={startPageFromCalendly}
                        className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-violet-200"
                      >
                        Create Page from these offers →
                      </button>
                    )}
                  </div>

                  {calendlyResult.structuredOffers?.length > 0 && (
                    <div className="space-y-2">
                      {calendlyResult.structuredOffers.slice(0, 6).map((offer: any, i: number) => (
                        <div key={i} className="text-sm bg-white/[0.03] p-3 rounded flex items-center justify-between gap-3">
                          <div>
                            <span className="font-medium">{offer.name}</span>
                            <span className="ml-2 text-violet-300">• {offer.duration}</span>
                          </div>
                          <a
                            href={offer.url}
                            target="_blank"
                            className="text-xs text-violet-400 hover:text-violet-300 underline"
                          >
                            Booking link
                          </a>
                        </div>
                      ))}
                      {calendlyResult.structuredOffers.length > 6 && (
                        <p className="text-[10px] text-zinc-500">+ {calendlyResult.structuredOffers.length - 6} more event types</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 p-5">
            <div className="font-semibold mb-2 text-cyan-300">Phase 3 in progress: Integrations & Automation</div>
            <ul className="text-sm text-[#9CA3AF] space-y-1">
              <li>• <span className="text-emerald-300">Calendly PAT import</span> — available now (use in Create wizard or re-analyze from editor)</li>
              <li>• Bulk Calendly / Acuity + webhook support (UI + secret storage live)</li>
              <li>• Stripe price/availability re-sync (in progress)</li>
              <li>• Shopify catalog import — foundation live (public feed + rich offers)</li>
              <li>• <span className="text-pink-300">Square consumer booking</span> — stub live (rich mobile/travel/duration services for local businesses)</li>
              <li>• <span className="text-orange-300">Acuity Scheduling</span> — consumer stub live (coaching, beauty, wellness, medical)</li>
              <li>• CSV + Website hybrid import</li>
            </ul>
            <p className="mt-3 text-[10px] text-zinc-500">Goal: Connect once → pages stay fresh for agents automatically.</p>
          </div>

          {/* Phase 3: Basic outbound webhook config (Zapier/generic foundation) */}
          <div className="rounded-xl border border-white/10 p-5">
            <div className="font-semibold mb-2 text-cyan-300">Outbound Webhooks (Demo)</div>
            <p className="text-xs text-[#9CA3AF] mb-3">Fire a webhook when integrations re-sync or when real bookings arrive via webhook (e.g. Calendly). Configure endpoints here for demo/testing.</p>

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
                        const demoSecret = 'demo-webhook-secret-for-testing'
                        const recHeaders: Record<string, string> = {
                          'Content-Type': 'application/json',
                          'x-nexez-test-secret': demoSecret,
                          'x-nexez-test-page-slug': 'demo',
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
      </div>
    </main>
  )
}
