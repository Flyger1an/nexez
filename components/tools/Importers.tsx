'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ImportResult } from './ImportResult'
import { recordIntegration } from '../../lib/integration-status'

// Self-contained integration importers for the Tools page. Each owns its state,
// handler, and "Connected" status (restored from localStorage on mount), so the
// Tools page stays a thin orchestrator. Import logic is unchanged.

export function StripeImporter() {
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeResult, setStripeResult] = useState<any>(null)
  const [stripeConnected, setStripeConnected] = useState<{ lastImport: string } | null>(null)

  useEffect(() => {
    try {
      const s = localStorage.getItem('nexez_stripe_connection')
      if (s) setStripeConnected(JSON.parse(s))
    } catch {}
  }, [])

  async function handleStripeImport() {
    setStripeLoading(true)
    setStripeResult(null)

    try {
      const res = await fetch('/api/integrations/stripe/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      setStripeResult(data)

      if (!data.error) {
        const conn = { lastImport: new Date().toISOString() }
        localStorage.setItem('nexez_stripe_connection', JSON.stringify(conn))
        setStripeConnected(conn)
        void recordIntegration('stripe', 'Catalog imported')
      }
    } catch (e) {
      setStripeResult({ error: 'Failed to connect to Stripe' })
    } finally {
      setStripeLoading(false)
    }
  }

  return (
    <div className="mt-8 border-t border-white/10 pt-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--signal)]">Stripe Product &amp; Price Import</h3>
          <p className="text-xs text-[#9CA3AF] mt-1">Import products and prices from your connected Stripe catalog as editable offers.</p>
        </div>
        {stripeConnected && (
          <div className="text-right text-xs">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ready)]/10 px-3 py-1 text-[var(--ready)]">
              <div className="size-1.5 rounded-full bg-[var(--ready)]" />
              Connected
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">
              Last import {new Date(stripeConnected.lastImport).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleStripeImport}
          disabled={stripeLoading}
          className="btn-primary"
        >
          {stripeLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import Stripe Catalog'}
        </button>
        {stripeConnected && (
          <button
            onClick={handleStripeImport}
            disabled={stripeLoading}
            className="rounded-lg border border-[var(--signal)]/40 px-4 py-2 text-sm text-[var(--signal)] hover:bg-white/5"
          >
            Re-sync
          </button>
        )}
      </div>

      <ImportResult
        result={stripeResult}
        wrapperClass="mt-4 rounded-xl border border-white/10 bg-black/30 p-5"
        createClass="bg-[var(--signal)] px-4 py-1.5 hover:bg-[var(--signal)]"
        maxOffers={3}
        onCreate={() => {
          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(stripeResult.structuredOffers))
          window.location.href = '/create?imported=true&source=stripe'
        }}
        renderOffer={(o: any, i: number) => (
          <div key={i}>• {o.name} - {o.price} {o.tiers ? '(recurring options)' : ''}</div>
        )}
        footer={
          stripeResult && !stripeResult.error ? (
            <div className="mt-1 text-xs text-[#9CA3AF]">{stripeResult.structuredOffers?.length || 0} products imported</div>
          ) : null
        }
      />
    </div>
  )
}

export function ShopifyImporter() {
  const [shopifyUrl, setShopifyUrl] = useState('')
  const [shopifyToken, setShopifyToken] = useState('')
  const [shopifyLoading, setShopifyLoading] = useState(false)
  const [shopifyResult, setShopifyResult] = useState<any>(null)
  const [shopifyConnected, setShopifyConnected] = useState<{ lastImport: string } | null>(null)

  useEffect(() => {
    try {
      const s = localStorage.getItem('nexez_shopify_connection')
      if (s) setShopifyConnected(JSON.parse(s))
    } catch {}
  }, [])

  async function handleShopifyImport(tokenOverride?: string) {
    if (!shopifyUrl.trim()) return
    setShopifyLoading(true)
    setShopifyResult(null)

    try {
      // Authenticated import pulls the full private catalog; otherwise fall back
      // to the public catalog via the general site importer.
      const effectiveToken = (tokenOverride ?? shopifyToken).trim()
      const request = effectiveToken
        ? { url: '/api/integrations/shopify/import', body: { shop: shopifyUrl.trim(), accessToken: effectiveToken } }
        : { url: '/api/tools/import-site', body: { url: shopifyUrl.trim(), industry: 'retail shopify' } }

      const res = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      })
      const data = await res.json()
      setShopifyResult(data)

      if (!data.error) {
        const conn = { lastImport: new Date().toISOString() }
        setShopifyConnected(conn)
        try { localStorage.setItem('nexez_shopify_connection', JSON.stringify(conn)) } catch {}
        void recordIntegration('shopify', 'Catalog imported')
      }
    } catch (e) {
      setShopifyResult({ error: 'Failed to import Shopify catalog' })
    } finally {
      setShopifyLoading(false)
    }
  }

  return (
    <div className="mt-8 border-t border-white/10 pt-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[var(--signal)]">Shopify Catalog Import</h3>
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
          onClick={() => void handleShopifyImport()}
          disabled={shopifyLoading || !shopifyUrl.trim()}
          className="btn-primary"
        >
          {shopifyLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import Catalog'}
        </button>
        {shopifyConnected && (
          <button
            onClick={() => {
              const token = prompt('Paste Shopify Admin token for re-sync (or leave empty for public):')
              if (token !== null && shopifyUrl) void handleShopifyImport(token)
            }}
            disabled={shopifyLoading}
            className="rounded-lg border border-[var(--signal)]/40 px-4 py-2 text-sm text-[var(--signal)] hover:bg-white/5"
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
          placeholder="Admin API token (optional)"
          className="w-full input text-sm"
        />
      </div>

      <ImportResult
        result={shopifyResult}
        wrapperClass="mt-4 rounded-xl border border-white/10 bg-black/30 p-5"
        defaultMessage="Shopify catalog imported"
        createClass="bg-[var(--signal)] px-4 py-1.5 hover:bg-[var(--signal)]"
        onCreate={() => {
          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(shopifyResult.structuredOffers))
          window.location.href = '/create?imported=true&source=shopify'
        }}
        renderOffer={(o: any, i: number) => (
          <div key={i}>• {o.name} - {o.price}</div>
        )}
      />
      <p className="mt-2 text-[10px] text-zinc-500">
        Leave this empty for the public catalog. Add an Admin API token only when you need private products.
      </p>
    </div>
  )
}

export function AcuityImporter() {
  const [acuityToken, setAcuityToken] = useState('')
  const [acuityLoading, setAcuityLoading] = useState(false)
  const [acuityResult, setAcuityResult] = useState<any>(null)
  const [acuityConnected, setAcuityConnected] = useState<{ lastImport: string } | null>(null)

  useEffect(() => {
    try {
      const s = localStorage.getItem('nexez_acuity_connection')
      if (s) setAcuityConnected(JSON.parse(s))
    } catch {}
  }, [])

  async function handleAcuityImport() {
    setAcuityLoading(true)
    setAcuityResult(null)

    try {
      const res = await fetch('/api/integrations/acuity/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: acuityToken.trim() || undefined }),
      })
      const data = await res.json()
      setAcuityResult(data)

      if (!data.error) {
        const conn = { lastImport: new Date().toISOString() }
        setAcuityConnected(conn)
        try { localStorage.setItem('nexez_acuity_connection', JSON.stringify(conn)) } catch {}
        void recordIntegration('acuity', 'Appointments imported')
      }
    } catch (e) {
      setAcuityResult({ error: 'Failed to import from Acuity' })
    } finally {
      setAcuityLoading(false)
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-[var(--amber)]">Acuity Scheduling - Consumer Services</div>
          <p className="text-xs text-[#9CA3AF]">Import appointment types for coaching, beauty, wellness, medical, fitness. Strong scheduling + consumer fields.</p>
        </div>
        {acuityConnected && (
          <span className="text-[10px] text-[var(--ready)]">Connected • {new Date(acuityConnected.lastImport).toLocaleTimeString()}</span>
        )}
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={acuityToken}
          onChange={(e) => setAcuityToken(e.target.value)}
          placeholder="Acuity API Key or User ID"
          className="flex-1 input text-sm"
        />
        <button
          onClick={handleAcuityImport}
          disabled={acuityLoading}
          className="btn-primary"
        >
          {acuityLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import from Acuity'}
        </button>
        {acuityConnected && (
          <button
            onClick={() => handleAcuityImport()}
            disabled={acuityLoading}
            className="rounded-lg border border-[var(--amber)]/40 px-3 py-1 text-sm text-[var(--amber)] hover:bg-white/5"
          >
            Re-sync
          </button>
        )}
      </div>

      <ImportResult
        result={acuityResult}
        defaultMessage="Acuity appointment types imported"
        createClass="bg-[var(--amber)] px-4 py-1 hover:bg-[var(--amber)]"
        maxOffers={4}
        onCreate={() => {
          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(acuityResult.structuredOffers))
          window.location.href = '/create?imported=true&source=acuity'
        }}
        renderOffer={(o: any, i: number) => (
          <div key={i}>• {o.name} - {o.price} {o.duration ? `(${o.duration})` : ''}</div>
        )}
        footer={<p className="mt-2 text-[10px] text-zinc-500">Great for time-based consumer services with durations and tiers.</p>}
      />
    </div>
  )
}

export function SquareImporter() {
  const [squareToken, setSquareToken] = useState('')
  const [squareLoading, setSquareLoading] = useState(false)
  const [squareResult, setSquareResult] = useState<any>(null)
  const [squareConnected, setSquareConnected] = useState<{ lastImport: string } | null>(null)

  useEffect(() => {
    try {
      const s = localStorage.getItem('nexez_square_connection')
      if (s) setSquareConnected(JSON.parse(s))
    } catch {}
  }, [])

  async function handleSquareImport() {
    setSquareLoading(true)
    setSquareResult(null)

    try {
      const res = await fetch('/api/integrations/square/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: squareToken.trim() || undefined }),
      })
      const data = await res.json()
      setSquareResult(data)

      // Only record a real connection when live items came back (connected: true).
      if (!data.error && data.connected) {
        const conn = { lastImport: new Date().toISOString() }
        setSquareConnected(conn)
        try { localStorage.setItem('nexez_square_connection', JSON.stringify(conn)) } catch {}
        void recordIntegration('square', 'Catalog imported')
      }
    } catch (e) {
      setSquareResult({ error: 'Failed to import from Square' })
    } finally {
      setSquareLoading(false)
    }
  }

  const isSample = squareResult && !squareResult.error && squareResult.connected === false

  return (
    <div className="mt-6 rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-[var(--signal)]">Square - Bookings &amp; Payments</div>
          <p className="text-xs text-[#9CA3AF]">Import your Square catalog items as offers - for mobile, wellness, and home services.</p>
        </div>
        {squareConnected && (
          <span className="text-[10px] text-[var(--ready)]">Connected • {new Date(squareConnected.lastImport).toLocaleTimeString()}</span>
        )}
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="password"
          value={squareToken}
          onChange={(e) => setSquareToken(e.target.value)}
          placeholder="Square access token (Catalog read)"
          className="flex-1 input text-sm"
        />
        <button
          onClick={handleSquareImport}
          disabled={squareLoading}
          className="btn-primary"
        >
          {squareLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import from Square'}
        </button>
        {squareConnected && (
          <button
            onClick={() => handleSquareImport()}
            disabled={squareLoading}
            className="rounded-lg border border-[var(--signal)]/40 px-3 py-1 text-sm text-[var(--signal)] hover:bg-white/5"
          >
            Re-sync
          </button>
        )}
      </div>

      <ImportResult
        result={squareResult}
        defaultMessage="Square catalog imported"
        createClass="bg-[var(--signal)] px-4 py-1 hover:bg-[var(--signal)]"
        maxOffers={4}
        onCreate={() => {
          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(squareResult.structuredOffers))
          window.location.href = '/create?imported=true&source=square'
        }}
        renderOffer={(o: any, i: number) => (
          <div key={i}>• {o.name} - {o.price} {o.duration ? `(${o.duration})` : ''}</div>
        )}
        footer={
          isSample ? (
            <p className="mt-2 text-[10px] text-[var(--amber)]">
              Showing sample data - add a Square access token with Catalog read to import your live items.
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-zinc-500">Variations become tiers; price_money becomes price.</p>
          )
        }
      />
    </div>
  )
}
