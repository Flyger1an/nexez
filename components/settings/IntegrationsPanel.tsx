'use client'

import { useCallback, useEffect, useState } from 'react'

// One per-listing home for every integration: connect once (token stored
// encrypted server-side), then re-sync manually or let auto-sync run — never
// re-entering the token until you disconnect. Replaces the token-prompt re-sync
// scattered across the editor / Tools / legacy Settings section.

type Provider = 'calendly' | 'shopify' | 'square' | 'acuity' | 'stripe'
type Kind = 'token' | 'oauth' | 'connect'
type Connection = {
  provider: Provider
  label: string
  connected: boolean
  kind: Kind
  autoSync: boolean
  canSync: boolean
  lastSyncedAt: string | null
}

const HELP: Record<Provider, string> = {
  calendly: 'Pull your event types in as bookable offers and keep availability in sync with your real calendar.',
  shopify: 'Import your products as offers and re-sync the catalog whenever it changes.',
  square: 'Import your Square catalog items as offers and re-sync when they change.',
  acuity: 'Import your Acuity appointment types as bookable offers.',
  stripe: 'Take payments and keep offer prices in sync — managed through Stripe Connect.',
}

// Fields collected to connect a token provider. Empty = uses the stored value.
const CONNECT_FIELDS: Record<Exclude<Provider, 'stripe'>, { key: string; label: string; secret?: boolean }[]> = {
  calendly: [{ key: 'token', label: 'Calendly Personal Access Token', secret: true }],
  shopify: [{ key: 'shop', label: 'your-store.myshopify.com' }, { key: 'token', label: 'Admin API access token', secret: true }],
  square: [{ key: 'accessToken', label: 'Square access token', secret: true }],
  acuity: [{ key: 'userId', label: 'Acuity User ID' }, { key: 'apiKey', label: 'Acuity API key', secret: true }],
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

// Build the POST /secrets body from the collected fields for a token provider.
function connectBody(provider: Exclude<Provider, 'stripe'>, vals: string[]): Record<string, unknown> {
  switch (provider) {
    case 'calendly':
      return { calendly_pat: vals[0] }
    case 'shopify':
      return { shopify_credentials: { shop: vals[0], token: vals[1] } }
    case 'square':
      return { square_credentials: { accessToken: vals[0] } }
    case 'acuity':
      return { acuity_credentials: { userId: vals[0], apiKey: vals[1] } }
  }
}

function clearBody(provider: Exclude<Provider, 'stripe'>): Record<string, unknown> {
  return provider === 'calendly' ? { calendly_pat: '' } : { [`${provider}_credentials`]: {} }
}

export function IntegrationsPanel({ pageId, isPro, onMessage }: { pageId: string; isPro: boolean; onMessage?: (m: string) => void }) {
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // `${provider}:${action}`
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // `${provider}:${fieldKey}` -> value

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
  const draftKey = (p: string, f: string) => `${p}:${f}`

  async function connect(provider: Exclude<Provider, 'stripe'>) {
    const fields = CONNECT_FIELDS[provider]
    const vals = fields.map((f) => (drafts[draftKey(provider, f.key)] ?? '').trim())
    if (vals.some((v) => !v)) return
    setBusy(`${provider}:connect`)
    try {
      const res = await fetch(`/api/pages/${pageId}/secrets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(connectBody(provider, vals)),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        say(j.error || `Could not connect ${provider}.`)
        return
      }
      setDrafts((d) => {
        const next = { ...d }
        for (const f of fields) delete next[draftKey(provider, f.key)]
        return next
      })
      say('Connected. Syncing your catalog…')
      await load()
      await sync(provider) // first sync right after connecting, no extra click
    } catch {
      say(`Could not connect ${provider}.`)
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(provider: Exclude<Provider, 'stripe'>) {
    setBusy(`${provider}:disconnect`)
    try {
      const res = await fetch(`/api/pages/${pageId}/secrets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(clearBody(provider)),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        say(j.error || `Could not disconnect ${provider}.`)
        return
      }
      say('Disconnected. Reconnect anytime with a token.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function sync(provider: Provider) {
    setBusy(`${provider}:sync`)
    try {
      const res = await fetch(`/api/pages/${pageId}/integrations/${provider}/sync`, { method: 'POST' })
      const j = (await res.json().catch(() => ({}))) as { imported?: number; windows?: number; error?: string }
      if (!res.ok) {
        say(j.error || `Could not sync ${provider}.`)
        return
      }
      const slots = j.windows ? ` · ${j.windows} open-slot window${j.windows === 1 ? '' : 's'}` : ''
      say(`Synced ${j.imported ?? 0} offer${j.imported === 1 ? '' : 's'}${slots}.`)
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
        const tokenProvider = c.kind === 'token' ? (c.provider as Exclude<Provider, 'stripe'>) : null
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
                {tokenProvider ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => disconnect(tokenProvider)}
                    className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    {busy === `${c.provider}:disconnect` ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : null}
                <span className="text-[10px] text-zinc-500">
                  {c.kind === 'oauth' ? 'Installed securely through Shopify' : c.autoSync ? 'Auto-syncs in the background' : 'Manual re-sync'}
                  {last ? ` · last synced ${last}` : ''}
                </span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {!isPro ? <div className="text-[10px] text-[var(--caution)]">Connecting live integrations is a Pro feature.</div> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {tokenProvider &&
                    CONNECT_FIELDS[tokenProvider].map((f) => (
                      <input
                        key={f.key}
                        type={f.secret ? 'password' : 'text'}
                        value={drafts[draftKey(c.provider, f.key)] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [draftKey(c.provider, f.key)]: e.target.value }))}
                        placeholder={f.label}
                        className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-mono"
                      />
                    ))}
                </div>
                <button
                  type="button"
                  disabled={isBusy || !isPro}
                  onClick={() => tokenProvider && connect(tokenProvider)}
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
