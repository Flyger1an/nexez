'use client'

import { useState } from 'react'

/**
 * Phase 3 per-listing outbound webhooks: register endpoints (URL + optional
 * signing secret), fire a real test at one, and see what actually fired recently.
 *
 * `endpoints` and `testResults` are PROPS, with their setters passed through.
 * The settings page derives the section header's status pill and the nav badge
 * from both, so it stays their owner. Everything only this card cares about
 * (the draft URL/secret inputs, the in-flight save) lives here.
 *
 * Secrets are written through upsertSecrets rather than Supabase directly:
 * page_secrets is owner-RLS'd, so a collaborator cannot upsert it, and the
 * server route authorizes and writes as the page OWNER.
 */

export type OutboundEndpoint = {
  url: string
  /** A raw secret exists only in the unsaved browser draft and is never returned. */
  secret?: string
  hasSecret?: boolean
  persisted?: boolean
}

export type OutboundTestResult = {
  state: 'testing' | 'success' | 'failure'
  message: string
}

export function OutboundWebhooksPanel({
  slug,
  pageId,
  endpoints,
  setEndpoints,
  testResults,
  setTestResults,
  recentFires,
  upsertSecrets,
  onMessage,
  onPersisted,
}: {
  slug: string
  /** Absent until the listing exists; the save + test actions no-op without it. */
  pageId: string | undefined
  /** Lets the page mirror the saved endpoints onto its own copy of the listing. */
  onPersisted: (endpoints: OutboundEndpoint[]) => void
  endpoints: OutboundEndpoint[]
  setEndpoints: React.Dispatch<React.SetStateAction<OutboundEndpoint[]>>
  testResults: Record<string, OutboundTestResult>
  setTestResults: React.Dispatch<React.SetStateAction<Record<string, OutboundTestResult>>>
  recentFires: any[]
  upsertSecrets: (values: Record<string, unknown>) => Promise<{ error?: { message: string } | null }>
  onMessage: (message: string) => void
}) {
  const [newOutboundUrl, setNewOutboundUrl] = useState('')
  const [newOutboundSecret, setNewOutboundSecret] = useState('')
  const [outboundSaving, setOutboundSaving] = useState(false)

  return (
                  <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4" data-testid="outbound-webhooks-panel">
                    <div className="text-sm font-medium text-[var(--signal)] mb-2">Zapier-compatible webhooks</div>
                    <p className="text-[10px] text-zinc-400 mb-3">Send confirmed Calendly bookings and checkout signals to a Zapier Catch Hook, Make, n8n, or your own system. Optional signing secrets are encrypted and never returned.</p>

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
                              const newEp: OutboundEndpoint = { url: newOutboundUrl.trim(), persisted: false }
                              if (newOutboundSecret.trim()) newEp.secret = newOutboundSecret.trim()
                              setEndpoints(prev => {
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
                        placeholder="Optional signing secret"
                        className="w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-mono"
                      />
                    </div>

                    {/* List with remove + Send Test per endpoint */}
                    {endpoints.length > 0 && (
                      <div className="text-xs mb-3 space-y-1.5">
                        {endpoints.map((ep, i) => (
                          <div
                            key={ep.url}
                            className="rounded border border-white/10 bg-black/30 p-2"
                            data-testid="outbound-webhook-row"
                          >
                            <div className="flex items-center justify-between font-mono text-[var(--fg-muted)]">
                              <span className="truncate text-[11px]">{ep.url}</span>
                              <div className="flex items-center gap-2">
                                {(ep.secret || ep.hasSecret) && (
                                  <span className="text-[9px] text-[var(--amber)]" data-testid={`outbound-secret-chip-${i}`}>
                                    secret
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={!ep.persisted || testResults[ep.url]?.state === 'testing'}
                                  onClick={async () => {
                                    setTestResults((previous) => ({
                                      ...previous,
                                      [ep.url]: { state: 'testing', message: 'Testing…' },
                                    }))
                                    try {
                                      const res = await fetch('/api/test-outbound', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
    	                                      endpoint: ep.url,
    	                                      pageId,
    	                                    }),
                                      })
                                      const data = await res.json()
                                      const nextResult: OutboundTestResult = data.success
                                        ? { state: 'success', message: `✓ Sent (HTTP ${data.status})` }
                                        : { state: 'failure', message: `✗ Failed: ${data.error || data.status}` }
                                      setTestResults((previous) =>
                                        previous[ep.url] ? { ...previous, [ep.url]: nextResult } : previous,
                                      )
                                    } catch {
                                      setTestResults((previous) =>
                                        previous[ep.url]
                                          ? {
                                              ...previous,
                                              [ep.url]: { state: 'failure', message: '✗ Network error' },
                                            }
                                          : previous,
                                      )
                                    }
                                  }}
                                  className="rounded border border-[var(--line)] px-1.5 py-0 text-[10px] text-[var(--fg)] hover:bg-[var(--fill-1)] disabled:opacity-60"
                                >
                                  {testResults[ep.url]?.state === 'testing' ? '...' : 'Send Test'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEndpoints((previous) => previous.filter((_, index) => index !== i))
                                    setTestResults((previous) => {
                                      const next = { ...previous }
                                      delete next[ep.url]
                                      return next
                                    })
                                  }}
                                  className="text-[10px] text-zinc-400 hover:text-red-400"
                                >
                                  remove
                                </button>
                              </div>
                            </div>
                            {testResults[ep.url] ? (
                              <div
                                role={testResults[ep.url].state === 'failure' ? 'alert' : 'status'}
                                data-testid="outbound-test-result"
                                data-state={testResults[ep.url].state}
                                className={`mt-1 font-mono text-[10px] ${
                                  testResults[ep.url].state === 'success'
                                    ? 'text-[var(--ready)]'
                                    : testResults[ep.url].state === 'failure'
                                      ? 'text-[var(--danger)]'
                                      : 'text-[var(--fg-muted)]'
                                }`}
                              >
                                {testResults[ep.url].message}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={outboundSaving}
                      onClick={async () => {
                        if (!pageId) return
                        setOutboundSaving(true)
                        onMessage('')
                        try {
                          const submitted = endpoints.map(({ url, secret, hasSecret }) => ({
                            url,
                            ...(secret ? { secret } : {}),
                            ...(hasSecret ? { hasSecret: true } : {}),
                          }))
                          const { error } = await upsertSecrets({ outbound_webhooks: submitted })
                          onMessage(error ? error.message : `Saved ${endpoints.length} webhook URL${endpoints.length === 1 ? '' : 's'}. They receive supported booking and checkout signals.`)
                          if (!error) {
                            const persisted = endpoints.map(({ url, secret, hasSecret }) => ({
                              url,
                              hasSecret: Boolean(secret || hasSecret),
                              persisted: true,
                            }))
                            setEndpoints(persisted)
                            onPersisted(persisted)
                          }
                        } catch (e: any) {
                          onMessage('Failed to save: ' + e.message)
                        } finally {
                          setOutboundSaving(false)
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-[var(--signal)]/40 px-4 py-1.5 text-sm text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-60"
                    >
                      {outboundSaving ? 'Saving...' : `Save ${endpoints.length} Webhook URL${endpoints.length === 1 ? '' : 's'}`}
                    </button>
                    <p className="mt-1 text-[10px] text-zinc-500">Save before testing. In Zapier, use Catch Hook for JSON or Catch Raw Hook when you need to inspect the X-Nexez-Signature header.</p>

                    {/* Example payloads for Zapier / Make / generic webhooks */}
                    <details className="mt-3 text-[10px] text-zinc-400">
                      <summary className="cursor-pointer hover:text-zinc-200">Example JSON payload</summary>
                      <pre className="mt-2 overflow-auto rounded bg-black/40 p-2 text-[9px] text-[var(--ready)]/90">
    {`// booking.received (confirmed Calendly booking)
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
                      <p className="mt-1 text-[9px]">Use this shape when connecting custom automation.</p>
                    </details>
                    {/* Real recent fires from DB (what actually triggered / would trigger your endpoints) */}
                    {recentFires.length > 0 && (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <div className="text-[10px] uppercase tracking-widest text-[var(--signal)] mb-1.5">Recent booking events</div>
                        <div className="space-y-1 text-[11px]">
                          {recentFires.map((evt, i) => (
                            <div key={i} className="flex justify-between text-[var(--signal)]/90">
                              <span>{evt.event_type?.replace(/_/g, ' ')} - {evt.offer_name}</span>
                              <span className="text-[var(--signal)]/60">{new Date(evt.created_at).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-1 text-[9px] text-zinc-500">Saved webhook URLs receive these events automatically.</div>
                      </div>
                    )}
                  </div>
  )
}
