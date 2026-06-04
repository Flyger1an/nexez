'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ImportResult } from './ImportResult'

// Self-contained integration importers for the Tools page. Each owns its state,
// handler, and "Connected" status (restored from localStorage on mount), so the
// Tools page stays a thin orchestrator. Import logic is unchanged.

export function StripeImporter() {
  const [stripeKey, setStripeKey] = useState('')
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

  return (
    <div className="mt-8 border-t border-white/10 pt-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-cyan-200">Stripe Product &amp; Price Import</h3>
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
          placeholder="Stripe secret key"
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
              const secret = prompt('Paste your Stripe Secret Key to re-sync:')
              if (secret) {
                setStripeKey(secret)
                setTimeout(() => handleStripeImport(), 50)
              }
            }}
            disabled={stripeLoading}
            className="rounded-lg border border-cyan-300/40 px-4 py-2 text-sm text-cyan-200 hover:bg-white/5"
          >
            Re-sync
          </button>
        )}
      </div>

      <ImportResult
        result={stripeResult}
        wrapperClass="mt-4 rounded-xl border border-white/10 bg-black/30 p-5"
        createClass="bg-cyan-300 px-4 py-1.5 hover:bg-cyan-200"
        maxOffers={3}
        onCreate={() => {
          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(stripeResult.structuredOffers))
          window.location.href = '/create?imported=true&source=stripe'
        }}
        renderOffer={(o: any, i: number) => (
          <div key={i}>• {o.name} — {o.price} {o.tiers ? '(recurring options)' : ''}</div>
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

  async function handleShopifyImport() {
    if (!shopifyUrl.trim()) return
    setShopifyLoading(true)
    setShopifyResult(null)

    try {
      // Authenticated import pulls the full private catalog; otherwise fall back
      // to the public catalog via the general site importer.
      const request = shopifyToken.trim()
        ? { url: '/api/integrations/shopify/import', body: { shop: shopifyUrl.trim(), accessToken: shopifyToken.trim() } }
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
              prompt('Paste Shopify Admin token for re-sync (or leave empty for public):')
              if (shopifyUrl) {
                setTimeout(() => handleShopifyImport(), 50)
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

      <ImportResult
        result={shopifyResult}
        wrapperClass="mt-4 rounded-xl border border-white/10 bg-black/30 p-5"
        defaultMessage="Shopify catalog imported"
        createClass="bg-purple-300 px-4 py-1.5 hover:bg-purple-200"
        onCreate={() => {
          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(shopifyResult.structuredOffers))
          window.location.href = '/create?imported=true&source=shopify'
        }}
        renderOffer={(o: any, i: number) => (
          <div key={i}>• {o.name} — {o.price}</div>
        )}
      />
      <p className="mt-2 text-[10px] text-zinc-500">
        Leave token empty for public catalog (most stores). Paste Admin API token for complete private access.
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
          <div className="font-semibold text-orange-300">Acuity Scheduling — Consumer Services</div>
          <p className="text-xs text-[#9CA3AF]">Import appointment types for coaching, beauty, wellness, medical, fitness. Strong scheduling + consumer fields.</p>
        </div>
        {acuityConnected && (
          <span className="text-[10px] text-emerald-400">Connected • {new Date(acuityConnected.lastImport).toLocaleTimeString()}</span>
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
          className="btn-primary bg-orange-300 text-zinc-950 hover:bg-orange-200"
        >
          {acuityLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import from Acuity'}
        </button>
        {acuityConnected && (
          <button
            onClick={() => handleAcuityImport()}
            disabled={acuityLoading}
            className="rounded-lg border border-orange-300/40 px-3 py-1 text-sm text-orange-200 hover:bg-white/5"
          >
            Re-sync
          </button>
        )}
      </div>

      <ImportResult
        result={acuityResult}
        defaultMessage="Acuity appointment types imported"
        createClass="bg-orange-300 px-4 py-1 hover:bg-orange-200"
        maxOffers={4}
        onCreate={() => {
          sessionStorage.setItem('nexez_imported_structured', JSON.stringify(acuityResult.structuredOffers))
          window.location.href = '/create?imported=true&source=acuity'
        }}
        renderOffer={(o: any, i: number) => (
          <div key={i}>• {o.name} — {o.price} {o.duration ? `(${o.duration})` : ''}</div>
        )}
        footer={<p className="mt-2 text-[10px] text-zinc-500">Great for time-based consumer services with durations and tiers.</p>}
      />
    </div>
  )
}
