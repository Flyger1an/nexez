'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  EyeOff,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  MARKETPLACE_CURATION_STATUSES,
  summarizeMarketplaceCuration,
  type MarketplaceCurationQueue,
  type MarketplaceCurationQueueItem,
  type MarketplaceCurationStatus,
} from '../../lib/marketplace-curation'

type Filter = 'attention' | MarketplaceCurationStatus | 'all'

function needsAttention(item: MarketplaceCurationQueueItem) {
  return item.decision.status === 'unreviewed'
    || (item.decision.status === 'candidate' && item.assessment.blockerCount > 0)
}

const STATUS_LABEL: Record<MarketplaceCurationStatus, string> = {
  unreviewed: 'Unreviewed',
  candidate: 'Candidate',
  certified: 'Certified',
  excluded: 'Excluded',
}

const STATUS_STYLE: Record<MarketplaceCurationStatus, string> = {
  unreviewed: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
  candidate: 'border-[var(--signal)]/30 bg-[var(--signal)]/10 text-[var(--signal)]',
  certified: 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
  excluded: 'border-red-400/30 bg-red-400/10 text-red-300',
}

export function MarketplaceCurationPanel({ queue }: { queue: MarketplaceCurationQueue }) {
  const [items, setItems] = useState(queue.items)
  const [filter, setFilter] = useState<Filter>('attention')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [draft, setDraft] = useState<{
    status: MarketplaceCurationStatus
    decisionReason: string
    notes: string
  } | null>(null)

  const summary = useMemo(() => summarizeMarketplaceCuration(items), [items])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesFilter = filter === 'all'
        || (filter === 'attention'
          ? needsAttention(item)
          : item.decision.status === filter)
      if (!matchesFilter) return false
      if (!needle) return true
      return [item.page.name, item.page.slug, item.page.industry, item.page.location]
        .some((value) => value?.toLowerCase().includes(needle))
    })
  }, [filter, items, query])

  if (!queue.available) {
    return (
      <section className="border-t border-border py-8" aria-labelledby="marketplace-curation-heading">
        <SectionIntro />
        <div className="flex min-h-32 items-center gap-4 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] px-5">
          <AlertTriangle className="size-5 shrink-0 text-[var(--amber)]" />
          <div>
            <p className="text-sm font-medium">Curation data is unavailable</p>
            <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">
              Confirm the marketplace curation migration and server credentials, then refresh Launch Control.
            </p>
          </div>
        </div>
      </section>
    )
  }

  function openItem(item: MarketplaceCurationQueueItem) {
    if (selectedId === item.page.id) {
      setSelectedId(null)
      setDraft(null)
      return
    }
    setSelectedId(item.page.id)
    setDraft({
      status: item.decision.status,
      decisionReason: item.decision.decisionReason || '',
      notes: item.decision.notes || '',
    })
    setFeedback(null)
  }

  async function save(item: MarketplaceCurationQueueItem) {
    if (!draft) return
    setSavingId(item.page.id)
    setFeedback(null)
    try {
      const response = await fetch('/api/admin/marketplace-curation', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageId: item.page.id,
          status: draft.status,
          decisionReason: draft.decisionReason || null,
          notes: draft.notes || null,
        }),
      })
      const body = await response.json().catch(() => ({})) as { item?: MarketplaceCurationQueueItem; error?: string }
      if (!response.ok || !body.item) throw new Error(body.error || 'The decision could not be saved.')
      setItems((current) => current.map((entry) => entry.page.id === body.item!.page.id ? body.item! : entry))
      setDraft({
        status: body.item.decision.status,
        decisionReason: body.item.decision.decisionReason || '',
        notes: body.item.decision.notes || '',
      })
      setFeedback({ type: 'success', message: `${body.item.page.name} is now ${STATUS_LABEL[body.item.decision.status].toLowerCase()}.` })
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The decision could not be saved.' })
    } finally {
      setSavingId(null)
    }
  }

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'attention', label: 'Needs attention', count: items.filter(needsAttention).length },
    { id: 'candidate', label: 'Candidates', count: summary.candidate },
    { id: 'certified', label: 'Certified', count: summary.certified },
    { id: 'excluded', label: 'Excluded', count: summary.excluded },
    { id: 'all', label: 'All', count: summary.total },
  ]

  return (
    <section className="border-t border-border py-8" aria-labelledby="marketplace-curation-heading">
      <SectionIntro />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Published listings" value={summary.total} detail={`${summary.unreviewed} awaiting a decision`} />
        <Metric label="Certified supply" value={summary.certified} detail={`${summary.candidate} candidates ready for review`} tone="ready" />
        <Metric label="Quality blockers" value={summary.blockers} detail="Must clear before certification" tone={summary.blockers ? 'warning' : 'ready'} />
        <Metric label="Excluded from discovery" value={summary.excluded} detail="Direct storefronts remain available" tone={summary.excluded ? 'muted' : 'ready'} />
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-white/[0.025] backdrop-blur-xl">
        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Curation filters">
            {filters.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={filter === entry.id}
                onClick={() => setFilter(entry.id)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium transition ${
                  filter === entry.id
                    ? 'bg-white/[0.09] text-foreground'
                    : 'text-[var(--fg-muted)] hover:bg-white/[0.05] hover:text-foreground'
                }`}
              >
                {entry.label}
                <span className="font-mono text-[10px] text-[var(--fg-muted-2)]">{entry.count}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full lg:w-72">
            <span className="sr-only">Find a marketplace listing</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted-2)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a listing"
              className="min-h-10 w-full rounded-md border border-border bg-black/25 pl-9 pr-3 text-sm outline-none transition placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60"
            />
          </label>
        </div>

        {feedback ? (
          <p
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`border-b border-border px-4 py-2.5 text-xs leading-5 ${feedback.type === 'error' ? 'bg-red-400/[0.06] text-red-300' : 'bg-[var(--ready)]/[0.05] text-[var(--ready)]'}`}
          >
            {feedback.message}
          </p>
        ) : null}

        {filtered.length ? (
          <div className="divide-y divide-border">
            {filtered.map((item) => {
              const expanded = selectedId === item.page.id
              return (
                <article key={item.page.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    aria-expanded={expanded}
                    className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-white/[0.035] md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{item.page.name}</span>
                        <StatusBadge status={item.decision.status} />
                        {item.page.marketplace_discoverable === false ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase text-red-300"><EyeOff className="size-3" /> Discovery off</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate font-mono text-[11px] text-[var(--fg-muted-2)]">/{item.page.slug}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
                      <span>{item.assessment.readiness}% ready</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.assessment.offerCount} offers</span>
                      {item.assessment.blockerCount ? (
                        <span className="inline-flex items-center gap-1 text-[var(--amber)]"><AlertTriangle className="size-3.5" /> {item.assessment.blockerCount}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--ready)]"><CheckCircle2 className="size-3.5" /> Clear</span>
                      )}
                    </span>
                    {expanded ? <ChevronUp className="size-4 text-[var(--fg-muted)]" /> : <ChevronDown className="size-4 text-[var(--fg-muted)]" />}
                  </button>

                  {expanded && draft ? (
                    <div className="border-t border-border bg-black/15 px-4 py-5">
                      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-medium">Quality review</h3>
                            <a
                              href={`/${item.page.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border px-2.5 text-xs text-[var(--fg-soft)] transition hover:bg-white/[0.06] hover:text-foreground"
                            >
                              Open storefront <ExternalLink className="size-3.5" />
                            </a>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <Score label="Readiness" value={`${item.assessment.readiness}%`} />
                            <Score label="Trust" value={`${item.assessment.trust}%`} />
                            <Score label="Actionable" value={`${item.assessment.actionableOfferCount}/${item.assessment.offerCount}`} />
                          </div>
                          <div className="mt-4 space-y-2">
                            {item.assessment.flags.length ? item.assessment.flags.map((flag) => (
                              <div key={flag.id} className="flex gap-3 rounded-md border border-border bg-white/[0.025] px-3 py-2.5">
                                {flag.severity === 'blocker'
                                  ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--amber)]" />
                                  : <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--signal)]" />}
                                <span>
                                  <span className="block text-xs font-medium text-foreground">{flag.label}</span>
                                  <span className="mt-0.5 block text-xs leading-5 text-[var(--fg-muted)]">{flag.detail}</span>
                                </span>
                              </div>
                            )) : (
                              <div className="flex gap-3 rounded-md border border-[var(--ready)]/25 bg-[var(--ready)]/[0.06] px-3 py-3">
                                <CheckCircle2 className="size-4 shrink-0 text-[var(--ready)]" />
                                <p className="text-xs leading-5 text-[var(--fg-soft)]">No automated quality blockers were found. Human review can certify this listing.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-medium text-[var(--fg-soft)]">Review status</span>
                            <select
                              value={draft.status}
                              onChange={(event) => setDraft({ ...draft, status: event.target.value as MarketplaceCurationStatus })}
                              className="min-h-10 w-full rounded-md border border-border bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--signal)]/60"
                            >
                              {MARKETPLACE_CURATION_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-medium text-[var(--fg-soft)]">
                              Decision reason {draft.status === 'excluded' ? <span className="text-red-300">Required</span> : null}
                            </span>
                            <input
                              value={draft.decisionReason}
                              maxLength={500}
                              onChange={(event) => setDraft({ ...draft, decisionReason: event.target.value })}
                              placeholder="Why this decision was made"
                              className="min-h-10 w-full rounded-md border border-border bg-black/25 px-3 text-sm outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-medium text-[var(--fg-soft)]">Private review notes</span>
                            <textarea
                              value={draft.notes}
                              maxLength={2_000}
                              rows={4}
                              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                              placeholder="Evidence, follow-up, or seller remediation"
                              className="w-full resize-y rounded-md border border-border bg-black/25 px-3 py-2 text-sm leading-5 outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60"
                            />
                          </label>
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <p className="text-[11px] leading-5 text-[var(--fg-muted-2)]">
                              Suggested: {STATUS_LABEL[item.assessment.suggestedStatus]}
                            </p>
                            <button
                              type="button"
                              onClick={() => save(item)}
                              disabled={savingId === item.page.id || (draft.status === 'excluded' && !draft.decisionReason.trim())}
                              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {savingId === item.page.id ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                              Save decision
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex min-h-32 items-center justify-center px-5 text-center">
            <p className="text-sm text-[var(--fg-muted)]">No listings match this filter.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function SectionIntro() {
  return (
    <div className="mb-5 flex max-w-3xl gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white/[0.04]">
        <ShieldCheck className="size-4 text-[var(--fg-muted)]" />
      </div>
      <div>
        <h2 id="marketplace-curation-heading" className="text-lg font-semibold tracking-tight">Marketplace curation</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
          Review published supply before featuring it in buyer discovery. Exclusion affects discovery only and never disables the seller&apos;s direct storefront.
        </p>
      </div>
    </div>
  )
}

function Metric({ label, value, detail, tone = 'muted' }: { label: string; value: number; detail: string; tone?: 'muted' | 'ready' | 'warning' }) {
  const color = tone === 'ready' ? 'text-[var(--ready)]' : tone === 'warning' ? 'text-[var(--amber)]' : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-white/[0.03] p-4 backdrop-blur-xl">
      <p className="text-xs font-medium text-[var(--fg-muted)]">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-semibold ${color}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-[var(--fg-muted-2)]">{detail}</p>
    </div>
  )
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white/[0.025] px-3 py-2">
      <p className="font-mono text-sm font-medium text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase text-[var(--fg-muted-2)]">{label}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: MarketplaceCurationStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
