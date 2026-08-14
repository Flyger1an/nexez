'use client'

import { useState } from 'react'

/**
 * A3 connection wizard: attach the domain to the hosting provider, watch the
 * Pending DNS -> Verifying -> Live state machine, show the records the provider
 * wants, and run the agent-crawlability probe against the live host.
 *
 * `status` is a PROP rather than local state. It is read in eight other places
 * in the settings page (the DNS instructions, the legacy-TXT warning, the status
 * line), so the page stays its owner and this panel only renders it. Crawlability
 * is genuinely local and lives here in full.
 */

export type DomainConnectionStatus = {
  state: string
  label: string
  detail: string
  providerConfigured: boolean
  ownershipVerified: boolean
  verifiedAt?: string | null
  verificationMethod: 'cname' | 'txt' | 'unknown'
  legacyTxtBlocksCname: boolean
  requiredRecords: Array<{ type: string; name?: string; value?: string }>
  routingRecords: Array<{ type: string; name?: string; value?: string }>
}

export function DomainConnectionPanel({
  customDomain,
  publicUrl,
  status,
  domainVerified,
  busy,
  attachIsNext,
  onAction,
  onMessage,
}: {
  customDomain: string
  /** Crawlability target when no custom domain is set yet. */
  publicUrl: string
  status: DomainConnectionStatus | null
  /** Verified AND the proof belongs to the currently typed domain (page-derived). */
  domainVerified: boolean
  busy: boolean
  /** Highlights attach as the recommended next step; derived by the page. */
  attachIsNext: boolean
  onAction: (action: 'attach' | 'status') => void
  onMessage: (message: string) => void
}) {
  const [crawlLoading, setCrawlLoading] = useState(false)
  const [crawlReport, setCrawlReport] = useState<
    null | { score: number; url: string; checks: Array<{ id: string; label: string; status: string; detail: string }> }
  >(null)

  // B6: targets the custom domain when set, else the platform page.
  async function runCrawlabilityTest() {
    const target = customDomain.trim()
      ? `https://${customDomain.trim().replace(/^https?:\/\//, '')}`
      : publicUrl
    setCrawlLoading(true)
    setCrawlReport(null)
    try {
      const res = await fetch('/api/crawlability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || 'Crawlability test failed.')
        return
      }
      setCrawlReport({ score: data.score, url: data.url, checks: data.checks || [] })
      onMessage(`Agent crawlability score: ${data.score}/100`)
    } catch (e: any) {
      onMessage('Crawlability test failed: ' + (e.message || 'network error'))
    } finally {
      setCrawlLoading(false)
    }
  }

  if (!customDomain) return null

  return (
    <div
      role={attachIsNext ? 'group' : undefined}
      aria-label={attachIsNext ? 'Recommended next step: attach and detect DNS' : undefined}
      className={`mt-4 rounded-lg p-3 ${
        attachIsNext
          ? 'settings-priority-card'
          : 'border border-[var(--line-soft)] bg-[var(--fill-1)]'
      }`}
    >
      {attachIsNext ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fg-muted)]">
          Recommended next step
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-200">Connection & SSL</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction('attach')}
            className={`rounded px-2.5 py-1 text-[11px] disabled:opacity-50 ${
              attachIsNext
                ? 'settings-emphasis-action'
                : 'border border-[var(--line)] text-[var(--fg)] hover:bg-[var(--fill-1)]'
            }`}
          >
            {busy ? 'Working…' : 'Attach & detect DNS'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction('status')}
            className="rounded border border-white/20 px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-white/5 disabled:opacity-50"
          >
            Check status
          </button>
        </div>
      </div>

      {(() => {
        const currentState =
          status?.state ?? (domainVerified ? 'verifying' : 'pending_dns')
        const steps = [
          { key: 'pending_dns', label: 'Pending DNS' },
          { key: 'verifying', label: 'Verifying' },
          { key: 'live', label: 'Live' },
        ]
        const order: Record<string, number> = { pending_dns: 0, verifying: 1, ssl_issuing: 1, live: 2 }
        const activeIdx = order[currentState] ?? 0
        const isError = currentState === 'error'
        return (
          <div className="mt-3 flex items-center gap-1">
            {steps.map((step, i) => (
              <div key={step.key} className="flex flex-1 items-center gap-1">
                <div
                  className={`h-1.5 flex-1 rounded-full ${
                    isError
                      ? 'bg-red-400/60'
                      : i <= activeIdx
                        ? 'bg-gradient-to-r from-[var(--signal)] to-[var(--ready)]'
                        : 'bg-white/10'
                  }`}
                />
                <span
                  className={`whitespace-nowrap text-[10px] ${
                    i <= activeIdx && !isError ? 'text-zinc-200' : 'text-zinc-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )
      })()}

      {status ? (
        <p className="mt-2 text-[11px] text-zinc-400">{status.detail}</p>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">
          Click “Attach & detect DNS” to connect this domain and receive the correct record instructions.
        </p>
      )}

      {status && !status.providerConfigured ? (
        <p className="mt-1 text-[10px] text-[var(--amber)]/80">
          Automatic SSL setup is not available for this project. Use the TXT ownership flow above, then configure hosting manually.
        </p>
      ) : null}

      {status?.verificationMethod === 'txt' && status.routingRecords.length ? (
        <div className="mt-2 space-y-1">
          <div className="text-[10px] font-medium text-zinc-300">Routing records:</div>
          {status.routingRecords.map((record, index) => (
            <code key={index} className="block break-all rounded bg-black/40 p-1 text-[10px] text-[var(--ready)]">
              {record.type} {record.name ?? ''} {record.value ?? ''}
            </code>
          ))}
        </div>
      ) : null}

      {status?.requiredRecords?.length ? (
        <div className="mt-2 space-y-1">
          <div className="text-[10px] font-medium text-zinc-300">Additional Vercel access-verification records:</div>
          {status.requiredRecords.map((r, i) => (
            <code key={i} className="block break-all rounded bg-black/40 p-1 text-[10px] text-[var(--ready)]">
              {r.type} {r.name ?? ''} {r.value ?? ''}
            </code>
          ))}
        </div>
      ) : null}

      {/* B6: agent crawlability test */}
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-300">Agent crawlability</p>
          <button
            type="button"
            disabled={crawlLoading}
            onClick={runCrawlabilityTest}
            className="rounded border border-[var(--signal)]/40 px-2.5 py-1 text-[11px] text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-50"
          >
            {crawlLoading ? 'Testing…' : 'Test agent crawlability'}
          </button>
        </div>
        {crawlReport ? (
          <div className="mt-2">
            <div className="text-[11px] text-zinc-300">
              Score:{' '}
              <span
                className={
                  crawlReport.score >= 80
                    ? 'text-[var(--ready)]'
                    : crawlReport.score >= 50
                      ? 'text-[var(--amber)]'
                      : 'text-red-300'
                }
              >
                {crawlReport.score}/100
              </span>{' '}
              <span className="text-zinc-500">({crawlReport.url})</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {crawlReport.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-1.5 text-[10px]">
                  <span>
                    {c.status === 'pass' ? '✅' : c.status === 'warn' ? '🟡' : '❌'}
                  </span>
                  <span className="text-zinc-300">{c.label}</span>
                  <span className="text-zinc-500">- {c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-zinc-500">
            Checks whether agents can reach the listing, read the agent files, and access it through robots.txt.
          </p>
        )}
      </div>
    </div>
  )
}
