'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// One per-listing home for every integration: connect once (token stored
// encrypted server-side), then re-sync manually or let auto-sync run - never
// re-entering the token until you disconnect. Replaces the token-prompt re-sync
// scattered across the editor / Tools / legacy Settings section.

type Provider = 'calendly' | 'shopify' | 'square' | 'acuity' | 'stripe' | 'google_calendar' | 'woocommerce' | 'servicem8'
type TokenProvider = 'calendly' | 'shopify' | 'square' | 'acuity'
type ManagedProvider = 'calendly' | 'square' | 'acuity' | 'google_calendar' | 'woocommerce' | 'servicem8'
type Kind = 'token' | 'oauth' | 'connect'
type Connection = {
  provider: Provider
  label: string
  connected: boolean
  kind: Kind
  autoSync: boolean
  canSync: boolean
  lastSyncedAt: string | null
  syncStatus?: 'idle' | 'pending' | 'attention'
  syncError?: string | null
  capabilities?: string[]
}

const HELP: Record<Provider, string> = {
  calendly: 'Connect with Calendly OAuth to import event types and keep availability in sync. Existing private personal-token connections remain supported.',
  shopify: 'Install Nexez from Shopify on any plan, or use manually entered Admin API credentials on Pro.',
  square: 'Connect with Square OAuth, import catalog items, and preserve the live Square Appointments booking path.',
  acuity: 'Import live Acuity appointment types as catalog offers. OAuth is used when the Nexez Acuity app is configured; existing private API connections remain supported.',
  stripe: 'Receive agent-driven transaction revenue through Stripe Connect. Payout setup is available on every plan.',
  google_calendar: 'Read live free/busy data through a narrow Google Calendar OAuth scope. Nexez does not read event details.',
  woocommerce: 'Authorize a read-only WooCommerce key to sync published products, inventory state, and order access.',
  servicem8: 'Connect ServiceM8 to turn active job templates into offers and verify live job access.',
}

const LABEL: Record<Provider, string> = {
  calendly: 'Calendly',
  shopify: 'Shopify',
  square: 'Square',
  acuity: 'Acuity',
  stripe: 'Stripe',
  google_calendar: 'Google Calendar',
  woocommerce: 'WooCommerce',
  servicem8: 'ServiceM8',
}

// Fields collected to connect a token provider. Empty = uses the stored value.
const CONNECT_FIELDS: Record<TokenProvider, { key: string; label: string; secret?: boolean }[]> = {
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
function connectBody(provider: TokenProvider, vals: string[]): Record<string, unknown> {
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

function clearBody(provider: TokenProvider): Record<string, unknown> {
  return provider === 'calendly' ? { calendly_pat: '' } : { [`${provider}_credentials`]: {} }
}

export function IntegrationsPanel({ pageId, isPro, onMessage }: { pageId: string; isPro: boolean; onMessage?: (m: string) => void }) {
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [contextLimited, setContextLimited] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // `${provider}:${action}`
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // `${provider}:${fieldKey}` -> value
  const callbackNoticeHandled = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}/settings-context`)
      if (!res.ok) {
        setLoadError('Could not load integration status. Retry without reconnecting any provider.')
        return
      }
      const json = (await res.json()) as { integrations?: Connection[]; contextLimited?: boolean }
      setContextLimited(json.contextLimited === true)
      if (Array.isArray(json.integrations)) {
        setConnections(json.integrations)
        setLoadError(null)
      }
    } catch {
      setLoadError('Could not load integration status. Retry without reconnecting any provider.')
    }
  }, [pageId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (callbackNoticeHandled.current) return
    callbackNoticeHandled.current = true
    const url = new URL(window.location.href)
    const provider = url.searchParams.get('provider') as Provider | null
    const outcome = url.searchParams.get('connection')
    if (!provider || !(provider in LABEL) || !outcome) return
    const label = LABEL[provider]
    const message = outcome === 'connected'
      ? `${label} connected and its first sync completed.`
      : outcome === 'attention'
        ? `${label} connected, but its first sync needs attention. Use Sync now or reconnect if the issue continues.`
        : outcome === 'cancelled'
          ? `${label} connection was cancelled. No access was stored.`
          : provider === 'servicem8'
            ? 'ServiceM8 could not be connected. Disable the Nexez add-on in ServiceM8, then try again.'
            : `${label} could not be connected. Try again.`
    onMessage?.(message)
    url.searchParams.delete('provider')
    url.searchParams.delete('connection')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [onMessage])

  const say = (m: string) => onMessage?.(m)
  const draftKey = (p: string, f: string) => `${p}:${f}`

  async function connect(provider: TokenProvider) {
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

  async function disconnectToken(provider: TokenProvider) {
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
    } catch {
      say(`Could not disconnect ${LABEL[provider]}. Check your connection and try again.`)
    } finally {
      setBusy(null)
    }
  }

  async function disconnectManaged(provider: ManagedProvider) {
    setBusy(`${provider}:disconnect`)
    try {
      const res = await fetch(`/api/pages/${pageId}/integrations/${provider}/connection`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        say(json.error || `Could not disconnect ${provider}.`)
        return
      }
      say(provider === 'servicem8'
        ? 'Disconnected from Nexez. Disable the Nexez add-on in ServiceM8 to revoke provider access.'
        : 'Disconnected. You can reconnect securely at any time.')
      await load()
    } catch {
      say(`Could not disconnect ${LABEL[provider]}. Check your connection and try again.`)
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
    } catch {
      say(`Could not sync ${LABEL[provider]}. Check your connection and try again.`)
    } finally {
      setBusy(null)
    }
  }

  if (!connections) {
    return loadError ? (
      <div role="alert" className="rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-4 text-xs text-[var(--fg)]">
        <p>{loadError}</p>
        <button type="button" onClick={() => void load()} className="btn-secondary mt-3 rounded-lg px-3 py-1.5 text-sm">
          Retry status
        </button>
      </div>
    ) : <div className="text-xs text-[var(--fg-muted)]">Loading integrations…</div>
  }

  if (contextLimited) {
    return (
      <div role="status" className="rounded-lg border border-[var(--line)] bg-[var(--fill-1)] p-4 text-xs leading-5 text-[var(--fg-muted)]">
        Connection status is temporarily unavailable. Your listing settings are unaffected, but connection and sync controls are hidden.
      </div>
    )
  }

  const priorityConnection =
    connections.find(
      (connection) =>
        (isPro || (connection.provider === 'shopify' && connection.kind === 'oauth')) &&
        connection.kind !== 'connect' &&
        connection.connected &&
        connection.canSync &&
        connection.syncStatus === 'attention',
    ) ??
    connections.find((connection) => !connection.connected && (connection.kind === 'token' || connection.kind === 'oauth') && isPro)

  return (
    <div className="flex flex-col gap-3">
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-3 text-xs text-[var(--fg)]">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} className="btn-secondary rounded-lg px-3 py-1.5 text-sm">
            Retry status
          </button>
        </div>
      ) : null}
      {connections.map((c) => {
        const last = timeAgo(c.lastSyncedAt)
        const isBusy = busy?.startsWith(`${c.provider}:`)
        const tokenProvider = c.kind === 'token' ? (c.provider as TokenProvider) : null
        const managedProvider = c.kind === 'oauth' && c.provider !== 'shopify' ? c.provider as ManagedProvider : null
        const isPriority = c.provider === priorityConnection?.provider
        const installedShopify = c.provider === 'shopify' && c.kind === 'oauth'
        const premiumConnectionPaused = c.kind !== 'connect' && c.connected && !isPro && !installedShopify
        const connectedStatus = premiumConnectionPaused
          ? {
              label: 'Paused by plan',
              className: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
            }
          : c.syncStatus === 'attention'
          ? {
              label: 'Needs attention',
              className: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
            }
          : c.syncStatus === 'pending'
            ? {
                label: 'Sync queued',
                className: 'border-[var(--line)] bg-[var(--fill-1)] text-[var(--fg-muted)]',
              }
            : c.lastSyncedAt
              ? {
                  label: 'Synced',
                  className: 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
                }
              : {
                  label: 'Connected',
                  className: 'border-[var(--line)] bg-[var(--fill-1)] text-[var(--fg-muted)]',
                }
        return (
          <div
            key={c.provider}
            role={isPriority ? 'group' : undefined}
            className={`rounded-lg p-3 ${isPriority ? 'settings-priority-card' : 'border border-[var(--line-soft)] bg-[var(--fill-1)]'}`}
            aria-label={isPriority ? `Recommended next step: ${c.label}` : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{c.label}</div>
              {c.connected ? (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${connectedStatus.className}`}>
                  {connectedStatus.label}
                </span>
              ) : (
                <span className="rounded-full border border-[var(--line)] bg-[var(--fill-1)] px-2 py-0.5 text-[10px] text-[var(--fg-muted)]">Not connected</span>
              )}
            </div>
            {isPriority ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fg-muted)]">
                Recommended next step
              </p>
            ) : null}
            <p className="mt-1 text-[10px] text-zinc-400">{HELP[c.provider]}</p>

            {c.kind === 'connect' ? (
              <div className="mt-2 text-[10px] text-zinc-400">
                {c.connected
                  ? 'Charges and payouts are enabled.'
                  : 'Complete Stripe setup before Nexez can settle transaction revenue.'}{' '}
                <a href="/dashboard/billing" className="text-[var(--signal)] hover:underline">
                  {c.connected ? 'Manage payouts' : 'Set up payouts'}
                </a>
              </div>
            ) : c.connected ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {c.canSync && (isPro || installedShopify) ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => sync(c.provider)}
                    aria-label={`Sync ${c.label}`}
                    aria-busy={busy === `${c.provider}:sync` || undefined}
                    className={`${isPriority ? 'settings-emphasis-action' : 'btn-secondary'} shrink-0 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40`}
                  >
                    {busy === `${c.provider}:sync` ? 'Syncing…' : 'Sync now'}
                  </button>
                ) : null}
                {tokenProvider ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => disconnectToken(tokenProvider)}
                    aria-label={`Disconnect ${c.label}`}
                    aria-busy={busy === `${c.provider}:disconnect` || undefined}
                    className="btn-secondary shrink-0 px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    {busy === `${c.provider}:disconnect` ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : null}
                {managedProvider ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => disconnectManaged(managedProvider)}
                    aria-label={`Disconnect ${c.label}`}
                    aria-busy={busy === `${c.provider}:disconnect` || undefined}
                    className="btn-secondary shrink-0 px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    {busy === `${c.provider}:disconnect` ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : null}
                <span className="text-[10px] text-zinc-500">
                  {premiumConnectionPaused
                    ? 'Connection retained · sync paused until Pro'
                    : installedShopify
                      ? c.syncStatus === 'pending'
                        ? 'Catalog update queued · installed app available on every plan'
                        : c.syncStatus === 'attention'
                          ? 'Installed app needs attention · available on every plan'
                          : 'Installed securely through Shopify · available on every plan'
                    : c.syncStatus === 'pending'
                    ? 'Catalog update queued'
                    : c.syncStatus === 'attention'
                      ? 'Auto-sync needs attention'
                      : c.autoSync
                        ? 'Auto-syncs in the background'
                        : c.kind === 'oauth'
                          ? `Connected securely through ${c.label}`
                          : 'Manual re-sync'}
                  {last ? ` · last synced ${last}` : ''}
                </span>
                {!premiumConnectionPaused && c.syncStatus === 'attention' && c.syncError ? (
                  <span role="alert" className="w-full text-[10px] text-[var(--amber)]">{c.syncError}</span>
                ) : null}
              </div>
            ) : c.kind === 'oauth' ? (
              <div className="mt-2 flex flex-col gap-2">
                {!isPro ? <div className="text-[10px] text-[var(--amber)]">Connecting live integrations is a Pro feature.</div> : null}
                {c.provider === 'woocommerce' ? (
                  <form action="/api/integrations/woocommerce/connect" method="get" className="flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="pageId" value={pageId} />
                    <input
                      type="url"
                      name="siteUrl"
                      required
                      disabled={!isPro}
                      placeholder="https://yourstore.com"
                      className="min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--fill-2)] px-3 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!isPro}
                      aria-label={`Connect ${c.label}`}
                      className={`${isPriority ? 'settings-emphasis-action' : 'btn-secondary'} rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40`}
                    >
                      Authorize read-only access
                    </button>
                  </form>
                ) : (
                  <a
                    href={`/api/integrations/${c.provider}/connect?pageId=${encodeURIComponent(pageId)}`}
                    aria-label={`Connect ${c.label}`}
                    aria-disabled={!isPro || undefined}
                    className={`${isPriority ? 'settings-emphasis-action' : 'btn-secondary'} self-start rounded-lg px-3 py-1.5 text-sm font-medium ${!isPro ? 'pointer-events-none opacity-40' : ''}`}
                  >
                    Connect securely
                  </a>
                )}
                <span className="text-[10px] text-[var(--fg-muted)]">OAuth credentials are encrypted server-side and are never returned to this browser.</span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {!isPro ? (
                  <div className="text-[10px] text-[var(--amber)]">
                    {c.provider === 'shopify'
                      ? 'Manual Shopify Admin credentials require Pro. The installed Nexez Shopify app is available on every plan.'
                      : 'Connecting live integrations is a Pro feature.'}
                  </div>
                ) : null}
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
                  aria-label={`Connect ${c.label}`}
                  aria-busy={busy === `${c.provider}:connect` || undefined}
                  className={`${isPriority ? 'settings-emphasis-action' : 'btn-secondary'} self-start rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40`}
                >
                  {busy === `${c.provider}:connect` ? 'Connecting…' : 'Connect'}
                </button>
                <span className="text-[10px] text-zinc-500">Stored encrypted. You&apos;ll never re-enter it - re-sync uses the saved connection until you disconnect.</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
