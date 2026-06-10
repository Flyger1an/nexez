'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Handshake,
  Loader2,
  Lock,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import {
  AgentNegotiation,
  NegotiationStatus,
  formatNegotiationAmount,
  getAllowedNegotiationTransitions,
  getNegotiationStatusLabel,
  getNegotiationStatusTone,
  isMissingTableError,
  summarizeNegotiations,
} from '../../../lib/negotiations'
import { withTimeout } from '../../../lib/async-timeout'
import { createClient } from '../../../utils/supabase/client'

const LOAD_TIMEOUT_MS = 12000

const TONE_BADGE: Record<ReturnType<typeof getNegotiationStatusTone>, string> = {
  open: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  progress: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  success: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  muted: 'border-white/10 bg-white/5 text-zinc-400',
}

const TRANSITION_LABEL: Record<NegotiationStatus, string> = {
  negotiation: 'Reopen',
  agreement_proposed: 'Propose agreement',
  held: 'Hold funds (escrow)',
  complete: 'Mark complete',
  declined: 'Decline',
  expired: 'Mark expired',
}

function transitionTone(to: NegotiationStatus): string {
  if (to === 'complete') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20'
  if (to === 'declined') return 'border-red-300/30 bg-red-300/10 text-red-100 hover:bg-red-300/20'
  return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20'
}

function transitionIcon(to: NegotiationStatus) {
  if (to === 'complete') return <CheckCircle2 className="size-3.5" />
  if (to === 'declined') return <XCircle className="size-3.5" />
  if (to === 'held') return <Lock className="size-3.5" />
  return <Handshake className="size-3.5" />
}

export default function NegotiationsInbox() {
  const [negotiations, setNegotiations] = useState<AgentNegotiation[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    setMigrationPending(false)
    const supabase = createClient()

    try {
      const {
        data: { user },
      } = await withTimeout(supabase.auth.getUser(), LOAD_TIMEOUT_MS, 'Timed out checking your session.')

      if (!user) {
        window.location.href = '/login?next=/dashboard/negotiations'
        return
      }

      const { data, error } = await withTimeout(
        supabase
          .from('agent_negotiations')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100)
          .returns<AgentNegotiation[]>(),
        LOAD_TIMEOUT_MS,
        'Timed out loading negotiations. Check your connection and retry.',
      )

      if (error) {
        if (isMissingTableError(error)) {
          // Not-yet-migrated project: show migration guidance, not an error.
          setMigrationPending(true)
          setNegotiations([])
        } else {
          console.error('Failed to load negotiations:', error.message)
          setLoadError(error.message || 'Failed to load negotiations.')
        }
      } else {
        setNegotiations(data || [])
      }
    } catch (err) {
      // Network failure or timeout — surface a retryable error instead of
      // spinning forever (the inbox once hung on "Loading negotiations…").
      console.error('Failed to load negotiations:', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to load negotiations.')
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(item: AgentNegotiation, to: NegotiationStatus) {
    setUpdatingId(item.id)
    setMessage('')
    const supabase = createClient()

    const { error } = await supabase
      .from('agent_negotiations')
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (error) {
      setMessage(`Could not update negotiation: ${error.message}`)
    } else {
      setNegotiations((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, status: to } : n)),
      )
      setMessage(`Negotiation moved to "${getNegotiationStatusLabel(to)}".`)
    }

    setUpdatingId(null)
  }

  const summary = useMemo(() => summarizeNegotiations(negotiations), [negotiations])

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-[#0A0A0F] text-white">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <Handshake className="size-6 text-[#7C3AED]" /> Negotiation Inbox
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">Agent proposals + escrow status.</p>
            </div>
            <button
              onClick={() => void load()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm transition hover:bg-white/10"
            >
              <RefreshCw className="size-4" /> Refresh
            </button>
          </header>

          {/* KPI summary */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Total" value={summary.total} />
            <Kpi label="New" value={summary.open} tone="open" />
            <Kpi label="Proposed" value={summary.proposed} tone="progress" />
            <Kpi label="Complete" value={summary.complete} tone="success" />
            <Kpi label="Declined" value={summary.declined} tone="muted" />
          </div>

          {message && (
            <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
              {message}
            </p>
          )}

          {loading ? (
            <div className="mt-10 flex items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="size-5 animate-spin" /> Loading negotiations…
            </div>
          ) : loadError ? (
            <div className="card mt-6 !p-8 text-center">
              <XCircle className="mx-auto size-8 text-red-400/80" />
              <p className="mt-3 text-sm font-medium text-zinc-200">Couldn’t load negotiations</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">{loadError}</p>
              <button
                onClick={() => void load()}
                className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-zinc-200 transition hover:bg-white/10"
              >
                <RefreshCw className="size-4" /> Retry
              </button>
            </div>
          ) : negotiations.length === 0 ? (
            <div className="card mt-6 !p-8 text-center">
              <Handshake className="mx-auto size-8 text-zinc-500" />
              <p className="mt-3 text-sm font-medium text-zinc-200">No negotiations yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                {migrationPending
                  ? 'Apply agent_negotiations migration.'
                  : 'Agent proposals appear here.'}
              </p>
              <a
                href="/dashboard"
                className="mt-4 inline-flex items-center gap-2 text-sm text-[#7C3AED] hover:underline"
              >
                Manage your pages <ExternalLink className="size-3.5" />
              </a>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {negotiations.map((item) => (
                <NegotiationCard
                  key={item.id}
                  item={item}
                  updating={updatingId === item.id}
                  onTransition={(to) => void updateStatus(item, to)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </ErrorBoundary>
  )
}

function Kpi({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: number
  tone?: ReturnType<typeof getNegotiationStatusTone>
}) {
  return (
    <div className="card !p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'muted' ? 'text-white' : ''}`}>{value}</p>
      <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] ${TONE_BADGE[tone]}`}>
        {label === 'Total' ? 'all time' : label.toLowerCase()}
      </span>
    </div>
  )
}

function NegotiationCard({
  item,
  updating,
  onTransition,
}: {
  item: AgentNegotiation
  updating: boolean
  onTransition: (to: NegotiationStatus) => void
}) {
  const escrowAvailable = item.escrow_mode !== 'not_configured'
  const transitions = getAllowedNegotiationTransitions(item.status, { escrowAvailable })
  const tone = getNegotiationStatusTone(item.status)

  return (
    <div className="card !p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs ${TONE_BADGE[tone]}`}>
              {getNegotiationStatusLabel(item.status)}
            </span>
            <span className="text-xs text-zinc-500">{item.offer_kind}</span>
            <RulesEvaluationBadge metadata={item.metadata} />
          </div>
          <h2 className="mt-2 truncate text-lg font-medium">{item.offer_name}</h2>
          <a
            href={`/${item.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#7C3AED] hover:underline"
          >
            /{item.slug} <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-cyan-100">
            {formatNegotiationAmount(item.amount_cents, item.currency)}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <Clock className="size-3" />
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="Buyer agent" value={item.buyer_agent} />
        <Field label="Contact" value={item.contact} />
        <Field label="Budget" value={item.budget_text} />
        <Field label="Timeline" value={item.timeline_text} />
        {item.buyer_query && <Field label="Request" value={item.buyer_query} full />}
        {item.requested_terms && Object.keys(item.requested_terms).length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-zinc-500">Requested terms</dt>
            <dd className="mt-1 rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs text-zinc-300">
              {JSON.stringify(item.requested_terms)}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        {!escrowAvailable && (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <Lock className="size-3" /> Escrow needs Stripe
          </span>
        )}
        {transitions.length === 0 ? (
          <span className="text-xs text-zinc-500">Negotiation closed.</span>
        ) : (
          transitions.map((to) => (
            <button
              key={to}
              disabled={updating}
              onClick={() => onTransition(to)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-50 ${transitionTone(to)}`}
            >
              {updating ? <Loader2 className="size-3.5 animate-spin" /> : transitionIcon(to)}
              {TRANSITION_LABEL[to]}
            </button>
          ))
        )}
        {(item.status === 'agreement_proposed' || item.status === 'held' || item.status === 'complete') && (
          <a
            href={`/dashboard/negotiations/${item.id}/receipt`}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            Receipt
          </a>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  if (!value) return null
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-200">{value}</dd>
    </div>
  )
}

// Advanced proposal review: shows LLM (platform-configured) or deterministic review + reasoning from metadata.proposal_review
// Falls back to basic rules_evaluation for legacy.
function RulesEvaluationBadge({ metadata }: { metadata: Record<string, unknown> | null }) {
  const review = metadata?.proposal_review as { recommendation?: string; reasoning?: string; source?: string; model?: string } | undefined
  const evaluation = metadata?.rules_evaluation as { decision?: string; reasons?: string[] } | undefined

  if (review?.recommendation) {
    const rec = review.recommendation
    const sourceLabel = review.source === 'llm' ? `LLM (${review.model || 'configured'})` : 'Rules'
    let color = 'border-amber-300/30 bg-amber-300/10 text-amber-200'
    if (rec === 'accept') color = 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
    if (rec === 'reject') color = 'border-red-300/30 bg-red-300/10 text-red-200'
    return (
      <span className={`rounded-full border px-2.5 py-0.5 text-xs ${color}`} title={review.reasoning}>
        {rec} by {sourceLabel}
      </span>
    )
  }

  if (!evaluation?.decision) return null

  if (evaluation.decision === 'auto_accept') {
    return (
      <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-0.5 text-xs text-emerald-200">
        Auto-accepted by rules
      </span>
    )
  }
  if (evaluation.decision === 'flag') {
    const reason = evaluation.reasons?.includes('below_min_price')
      ? 'below minimum price'
      : evaluation.reasons?.includes('exceeds_max_discount')
        ? 'exceeds max discount'
        : 'outside rules'
    return (
      <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-xs text-amber-200">
        Flagged: {reason}
      </span>
    )
  }
  return null
}
