'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  Loader2,
  Save,
} from 'lucide-react'
import {
  allowedCommerceSupplyTransitions,
  commerceSupplyCampaignStatusFor,
  COMMERCE_SUPPLY_STATUS_LABELS,
  type CommerceSupplyCampaign,
  type CommerceSupplyCampaignStatus,
} from '../../lib/commerce-supply-campaign'
import type {
  CommerceSupplyWorkflowItem,
  CommerceSupplyWorkflowSnapshot,
} from '../../lib/commerce-supply-workflow'

type Draft = {
  referenceId: string
  status: CommerceSupplyCampaignStatus
  reason: string
  idempotencyKey: string | null
}

const MAX_VISIBLE_SUPPLY_PRIORITIES = 10

export function CommerceSupplyWorkflowPanel({
  initialSnapshot,
  coverageGaps,
}: {
  initialSnapshot: CommerceSupplyWorkflowSnapshot
  coverageGaps: number
}) {
  const [items, setItems] = useState(initialSnapshot.items)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const controlsAvailable = initialSnapshot.available && initialSnapshot.verificationAvailable

  function toggle(item: CommerceSupplyWorkflowItem) {
    if (expandedId === item.referenceId) {
      setExpandedId(null)
      setDraft(null)
      return
    }
    const currentStatus = commerceSupplyCampaignStatusFor(item.campaign)
    const transitions = allowedCommerceSupplyTransitions(currentStatus)
    setExpandedId(item.referenceId)
    setDraft({
      referenceId: item.referenceId,
      status: transitions[0] ?? currentStatus,
      reason: '',
      idempotencyKey: null,
    })
    setFeedback(null)
  }

  async function save(item: CommerceSupplyWorkflowItem) {
    if (!draft || draft.referenceId !== item.referenceId || !draft.reason.trim()) return
    const idempotencyKey = draft.idempotencyKey ?? crypto.randomUUID()
    if (!draft.idempotencyKey) {
      setDraft((current) => current?.referenceId === item.referenceId
        ? { ...current, idempotencyKey }
        : current)
    }
    setSavingId(item.referenceId)
    setFeedback(null)
    try {
      const response = await fetch('/api/admin/commerce-supply-campaign', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          referenceId: item.referenceId,
          status: draft.status,
          reason: draft.reason,
          idempotencyKey,
        }),
      })
      const body = await response.json().catch(() => ({})) as {
        campaign?: CommerceSupplyCampaign
        error?: string
      }
      if (!response.ok || !body.campaign) {
        throw new Error(body.error || 'The campaign transition could not be saved.')
      }

      setItems((current) => current.map((entry) => entry.referenceId === item.referenceId
        ? {
            ...entry,
            campaign: body.campaign!,
            status: entry.certifiedSupply.length ? 'live' : body.campaign!.status,
          }
        : entry))
      const nextTransitions = allowedCommerceSupplyTransitions(body.campaign.status)
      setDraft({
        referenceId: item.referenceId,
        status: nextTransitions[0] ?? body.campaign.status,
        reason: '',
        idempotencyKey: null,
      })
      setFeedback({
        type: 'success',
        message: `${item.title} is now ${COMMERCE_SUPPLY_STATUS_LABELS[body.campaign.status].toLowerCase()}.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'The campaign transition could not be saved.',
      })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="mt-6" aria-labelledby="supply-priorities-heading">
      <div className="flex items-start gap-3">
        <ClipboardList className="mt-0.5 size-4 shrink-0 text-[var(--signal)]" />
        <div>
          <h3 id="supply-priorities-heading" className="text-sm font-semibold text-foreground">
            Seller recruitment priorities
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--fg-muted)]">
            Customer searches set the priority when available. Nexez then uses planned service categories to fill remaining marketplace gaps. Progress changes only when someone updates it.
          </p>
        </div>
      </div>

      {!initialSnapshot.available ? (
        <p className="mt-3 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-4 py-3 text-xs leading-5 text-[var(--fg-muted)]">
          Recruitment status cannot be saved right now. You can still read each brief, but the controls will remain off until setup is complete.
        </p>
      ) : null}


      {!initialSnapshot.verificationAvailable ? (
        <p className="mt-3 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-4 py-3 text-xs leading-5 text-[var(--fg-muted)]">
          Seller verification status is unavailable. You can still review coverage, but recruitment controls are off until Nexez can check existing sellers.
        </p>
      ) : null}

      {!initialSnapshot.demandAvailable ? (
        <p className="mt-3 rounded-lg border border-[var(--signal)]/25 bg-[var(--signal)]/[0.05] px-4 py-3 text-xs leading-5 text-[var(--fg-muted)]">
          Customer search activity is unavailable. These priorities come from the launch plan, not from customer searches.
        </p>
      ) : null}

      {feedback ? (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`mt-3 rounded-md px-4 py-2.5 text-xs leading-5 ${feedback.type === 'error' ? 'bg-red-400/[0.07] text-red-300' : 'bg-[var(--ready)]/[0.06] text-[var(--ready)]'}`}
        >
          {feedback.message}
        </p>
      ) : null}

      {items.length ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {items.slice(0, MAX_VISIBLE_SUPPLY_PRIORITIES).map((item) => {
            const expanded = expandedId === item.referenceId
            const transitions = allowedCommerceSupplyTransitions(
              commerceSupplyCampaignStatusFor(item.campaign),
            )
            const isLive = item.status === 'live'
            return (
              <article key={item.referenceId} className="rounded-lg border border-border bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.08em]">
                    <span className="font-mono text-[var(--signal)]">Priority {item.rank}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[var(--fg-muted)]">
                      {item.lifecycleLabel}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 ${item.basis === 'observed-demand' ? 'border-[var(--signal)]/30 text-[var(--signal)]' : 'border-[var(--amber)]/30 text-[var(--amber)]'}`}>
                      {item.basisLabel}
                    </span>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-medium text-foreground">{item.title}</h4>
                    <p className="mt-1 font-mono text-[10px] text-[var(--fg-muted-2)]">{item.domain}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-[var(--amber)]">{item.actionLabel}</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">{item.rationale}</p>
                {item.basis === 'observed-demand' ? (
                  <p className="mt-3 text-xs tabular-nums text-[var(--fg-muted-2)]">
                    {item.unresolved} not covered · {item.reference} guide only · {item.related} related seller · {item.live} seller match
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-[var(--fg-muted-2)]">
                    Planned launch category · not based on customer searches
                  </p>
                )}

                {isLive ? (
                  <div className="mt-3 rounded-md border border-[var(--ready)]/25 bg-[var(--ready)]/[0.05] px-3 py-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-[var(--ready)]">
                      <CheckCircle2 className="size-3.5" /> Verified seller found for this category
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.certifiedSupply.map((supply) => (
                        <a
                          key={`${supply.pageId}:${supply.offerName}`}
                          href={`/${supply.pageSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[var(--fg-soft)] underline decoration-white/25 underline-offset-2 hover:text-foreground"
                        >
                          {supply.pageName} · {supply.offerName} <ExternalLink className="size-3" />
                        </a>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-[var(--fg-muted)]">
                      The service category matches. Confirm the seller&apos;s location, availability, price, and fit before presenting it to a customer.
                    </p>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => toggle(item)}
                  aria-expanded={expanded}
                  className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-[var(--fg-soft)] transition hover:bg-white/[0.06] hover:text-foreground"
                >
                  {expanded ? 'Close brief' : 'Open recruitment brief'}
                  {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>

                {expanded ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs font-medium text-foreground">Objective</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{item.brief.objective}</p>
                    <p className="mt-3 text-xs font-medium text-foreground">Merchant profile</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{item.brief.merchantProfile}</p>

                    {item.brief.capabilityTags.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Required Commerce capabilities">
                        {item.brief.capabilityTags.map((tag) => (
                          <span key={tag} className="rounded-full border border-border px-2 py-1 font-mono text-[9px] text-[var(--fg-muted)]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {item.brief.verificationQuestions.length ? (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-foreground">Verify before certification</p>
                        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--fg-muted)]">
                          {item.brief.verificationQuestions.map((question) => <li key={question}>→ {question}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    <p className="mt-4 rounded-md border border-border bg-black/15 px-3 py-2.5 text-[11px] leading-5 text-[var(--fg-muted)]">
                      {item.brief.successBoundary}
                    </p>

                    {!isLive ? (
                      <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-medium text-[var(--fg-soft)]">Next status</span>
                          <select
                            value={draft?.referenceId === item.referenceId ? draft.status : transitions[0]}
                            disabled={!controlsAvailable || savingId === item.referenceId}
                            onChange={(event) => setDraft({
                              referenceId: item.referenceId,
                              status: event.target.value as CommerceSupplyCampaignStatus,
                              reason: draft?.referenceId === item.referenceId ? draft.reason : '',
                              idempotencyKey: null,
                            })}
                            className="min-h-10 w-full rounded-md border border-border bg-[var(--panel)] px-3 text-xs outline-none focus:border-[var(--signal)]/60 disabled:opacity-50"
                          >
                            {transitions.map((status) => (
                              <option key={status} value={status}>{COMMERCE_SUPPLY_STATUS_LABELS[status]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-medium text-[var(--fg-soft)]">Reason for change</span>
                          <input
                            value={draft?.referenceId === item.referenceId ? draft.reason : ''}
                            maxLength={500}
                            disabled={!controlsAvailable || savingId === item.referenceId}
                            onChange={(event) => setDraft({
                              referenceId: item.referenceId,
                              status: draft?.referenceId === item.referenceId ? draft.status : transitions[0],
                              reason: event.target.value,
                              idempotencyKey: null,
                            })}
                            placeholder="What changed or what happens next"
                            className="min-h-10 w-full rounded-md border border-border bg-black/25 px-3 text-xs outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60 disabled:opacity-50"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => save(item)}
                          disabled={
                            !controlsAvailable
                            || savingId === item.referenceId
                            || draft?.referenceId !== item.referenceId
                            || !draft.reason.trim()
                          }
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {savingId === item.referenceId ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                          Save
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-white/[0.025] px-5 py-4 text-sm text-[var(--fg-muted)]">
          No customer searches or planned launch categories are available.
        </div>
      )}

      {items.length > MAX_VISIBLE_SUPPLY_PRIORITIES ? (
        <p className="mt-2 text-xs text-[var(--fg-muted-2)]">Showing the top {MAX_VISIBLE_SUPPLY_PRIORITIES} of {items.length} recruitment priorities.</p>
      ) : null}

      {coverageGaps > 0 ? (
        <p className="mt-3 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-4 py-3 text-xs leading-5 text-[var(--fg-muted)]">
          {coverageGaps} {coverageGaps === 1 ? 'search does' : 'searches do'} not match a service category yet. Nexez keeps only the total until it can classify the request without storing personal details.
        </p>
      ) : null}
    </section>
  )
}

function StatusBadge({ status }: { status: CommerceSupplyWorkflowItem['status'] }) {
  const style = status === 'live'
    ? 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]'
    : status === 'dismissed'
      ? 'border-red-400/25 bg-red-400/[0.07] text-red-300'
      : status === 'new'
        ? 'border-border bg-white/[0.04] text-[var(--fg-muted)]'
        : 'border-[var(--amber)]/30 bg-[var(--amber)]/[0.07] text-[var(--amber)]'
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${style}`}>
      {COMMERCE_SUPPLY_STATUS_LABELS[status]}
    </span>
  )
}
