'use client'

import { useCallback, useEffect, useState } from 'react'

// One per-listing home for every integration: connect once (token stored
// encrypted server-side), then re-sync manually or let auto-sync run — never
// re-entering the token until you disconnect. Replaces the token-prompt re-sync
// scattered across the editor / Tools / legacy Settings section.

type Kind = 'token' | 'connect'
type Connection = {
  provider: 'calendly' | 'shopify' | 'stripe'
  label: string
  connected: boolean
  kind: Kind
  autoSync: boolean
  canSync: boolean
  lastSyncedAt: string | null
}

const HELP: Record<Connection['provider'], string> = {
  calendly: 'Pull your event types in as bookable offers and keep availability in sync with your real calendar.',
  shopify: 'Import your products as offers and re-sync the catalog whenever it changes.',
  stripe: 'Take payments and keep offer prices in sync — managed through Stripe Connect.',
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function IntegrationsPanel({ pageId, isPro, onMessage }: { pageId: string; isPro: boolean; onMessage?: (m: string) => void }) {
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // `${provider}:${action}`
  const [draftCalendly, setDraftCalendly] = useState('')
  const [draftShop, setDraftShop] = useState('')
  const [draftShopToken, setDraftShopToken] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}/settings-context`)
      if (!res.ok) return
      const json = (await res.json()) as { integrations?: Connection[] }
      if (Array.isArray(json.integrations)) setConnections(json.integrations)
    } catch {
      /* leave prior state */
    }
  }, [pageId])

  useEffect(() => {
    void load()
  }, [load])

  const say = (m: string) => onMessage?.(m)

  async function connect(provider: Connection['provider']) {
    const body: Record<string, unknown> = {}
    if (provider === 'calendly') {
      if (!draftCalendly.trim()) return
      body.calendly_pat = draftCalendly.trim()
    } else if (provider === 'shopify') {
      if (!draftShop.trim() || !draftShopToken.trim()) return
      body.shopify_credentials = { shop: draftShop.trim(), token: draftShopToken.trim() }
    }
    setBusy(`${provider}:connect`)
    try {
      const res = await fetch(`/api/pages/${pageId}/secrets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        say(j.error || `Could not connect ${provider}.`)
        return
      }
      setDraftCalendly('')
      setDraftShop('')
      setDraftShopToken('')
      say(`${provider === 'calendly' ? 'Calendly' : 'Shopify'} connected. Syncing your catalog…`)
      await load()
      await sync(provider) // first sync right after connecting, no extra click
    } catch {
      say(`Could not connect ${provider}.`)
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(provider: Connection['provider']) {
    setBusy(`${provider}:disconnect`)
    try {
      const body = provider === 'calendly' ? { calendly_pat: '' } : { shopify_credentials: {} }
      const res = await fetch(`/api/pages/${pageId}/secrets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        say(j.error || `Could not disconnect ${provider}.`)
        return
      }
      say(`${provider === 'calendly' ? 'Calendly' : 'Shopify'} disconnected. Reconnect anytime with a token.`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function sync(provider: Connection['provider']) {
    setBusy(`${provider}:sync`)
    try {
      const res = await fetch(`/api/pages/${pageId}/integrations/${provider}/sync`, { method: 'POST' })
      const j = (await res.json().catch(() => ({}))) as { imported?: number; windows?: number; error?: string }
      if (!res.ok) {
        say(j.error || `Could not sync ${provider}.`)
        return
      }
      const slots = j.windows ? ` · ${j.windows} open-slot window${j.windows === 1 ? '' : 's'}` : ''
      say(`Synced ${j.imported ?? 0} ${provider} offer${j.imported === 1 ? '' : 's'}${slots}.`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!connections) {
    return <div className="text-[11px] text-zinc-400">Loading integrations…</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {connections.map((c) => {
        const last = timeAgo(c.lastSyncedAt)
        const isBusy = busy?.startsWith(`${c.provider}:`)
        return (
          <div key={c.provider} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{c.label}</div>
              {c.connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ready)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ready)]">Connected</span>
              ) : (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">Not connected</span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-zinc-400">{HELP[c.provider]}</p>

            {/* Stripe: Connect-managed, no per-listing token */}
            {c.kind === 'connect' ? (
              <div className="mt-2 text-[10px] text-zinc-400">
                {c.connected ? 'Prices auto-sync from your Stripe account.' : 'Connect Stripe from the Billing tab to take payments and auto-sync prices.'}
              </div>
            ) : c.connected ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {c.canSync ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => sync(c.provider)}
                    className="shrink-0 rounded-lg border border-[var(--signal)]/40 px-3 py-1.5 text-sm text-[var(--signal)] transition hover:bg-[var(--signal)]/10 disabled:opacity-40"
                  >
                    {busy === `${c.provider}:sync` ? 'Syncing…' : 'Sync now'}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => disconnect(c.provider)}
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
                >
                  {busy === `${c.provider}:disconnect` ? 'Disconnecting…' : 'Disconnect'}
                </button>
                <span className="text-[10px] text-zinc-500">
                  {c.autoSync ? 'Auto-syncs in the background' : 'Manual re-sync'}
                  {last ? ` · last synced ${last}` : ''}
                </span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {!isPro ? (
                  <div className="text-[10px] text-[var(--caution)]">Connecting live integrations is a Pro feature.</div>
                ) : null}
                {c.provider === 'calendly' ? (
                  <input
                    type="password"
                    value={draftCalendly}
                    onChange={(e) => setDraftCalendly(e.target.value)}
                    placeholder="Calendly Personal Access Token"
                    className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-mono"
                  />
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={draftShop}
                      onChange={(e) => setDraftShop(e.target.value)}
                      placeholder="your-store.myshopify.com"
                      className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-mono"
                    />
                    <input
                      type="password"
                      value={draftShopToken}
                      onChange={(e) => setDraftShopToken(e.target.value)}
                      placeholder="Admin API access token"
                      className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                )}
                <button
                  type="button"
                  disabled={isBusy || !isPro}
                  onClick={() => connect(c.provider)}
                  className="self-start rounded-lg bg-[var(--signal)]/90 px-3 py-1.5 text-sm font-medium text-black transition hover:brightness-110 disabled:opacity-40"
                >
                  {busy === `${c.provider}:connect` ? 'Connecting…' : 'Connect'}
                </button>
                <span className="text-[10px] text-zinc-500">Stored encrypted. You&apos;ll never re-enter it — re-sync uses the saved connection until you disconnect.</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
