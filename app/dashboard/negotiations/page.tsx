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

// Note: createClient is used inside NegotiationCard for the manual owner message form
// (direct insert to negotiation_messages + status update for seller_owner role).

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

  // Surface the outcome when Stripe Checkout redirects back from an escrow hold.
  // The webhook flips the status to 'held' asynchronously, so this is just a hint.
  useEffect(() => {
    const escrow = new URLSearchParams(window.location.search).get('escrow')
    if (escrow === 'held') {
      setMessage('Escrow hold authorized — the status updates to “Funds held” once Stripe confirms.')
    } else if (escrow === 'cancelled') {
      setMessage('Escrow checkout was cancelled. No hold was placed.')
    }
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

  // Non-payment status transitions go through the server route, which validates the
  // transition (and the DB money-safety trigger backstops it) — no direct client writes.
  async function updateStatus(item: AgentNegotiation, to: NegotiationStatus) {
    setUpdatingId(item.id)
    setMessage('')
    try {
      const res = await fetch('/api/negotiations/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ negotiationId: item.id, to }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error || 'Could not update negotiation.')
        return
      }
      setNegotiations((prev) => prev.map((n) => (n.id === item.id ? { ...n, status: to } : n)))
      setMessage(`Negotiation moved to "${getNegotiationStatusLabel(to)}".`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update negotiation.')
    } finally {
      setUpdatingId(null)
    }
  }

  // Set/adjust the agreed amount before placing an escrow hold. Owner-direct
  // (RLS-scoped). The engine sets this on accept/counter; this lets the owner
  // confirm or override it.
  async function saveAmount(item: AgentNegotiation, dollars: number) {
    setMessage('')
    const cents = Math.round(dollars * 100)
    if (!Number.isFinite(cents) || cents < 50) {
      setMessage('Enter a valid agreed amount (minimum $0.50).')
      return
    }
    setUpdatingId(item.id)
    const supabase = createClient()
    const { error } = await supabase
      .from('agent_negotiations')
      .update({ amount_cents: cents, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (error) {
      setMessage(`Could not save amount: ${error.message}`)
    } else {
      setNegotiations((prev) => prev.map((n) => (n.id === item.id ? { ...n, amount_cents: cents } : n)))
      setMessage(`Agreed amount set to ${formatNegotiationAmount(cents, item.currency)}.`)
    }
    setUpdatingId(null)
  }

  // Owner escrow actions via /api/negotiations/escrow (the BUYER funds the hold).
  //  - approve → unlock a high-value agreement so the buyer's pay link activates.
  //  - capture → capture the buyer's held authorization → 'complete'.
  //  - cancel  → release the hold → 'declined'.
  async function runEscrow(item: AgentNegotiation, action: 'approve' | 'capture' | 'cancel') {
    setUpdatingId(item.id)
    setMessage('')
    try {
      const res = await fetch('/api/negotiations/escrow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ negotiationId: item.id, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error || `Escrow ${action} failed.`)
        return
      }
      const msg =
        action === 'approve'
          ? 'Approved — the buyer can now pay to secure the agreement.'
          : action === 'capture'
            ? 'Funds captured — negotiation complete.'
            : 'Escrow hold released.'
      setMessage(msg)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Escrow ${action} failed.`)
    } finally {
      setUpdatingId(null)
    }
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
                  onEscrow={(action) => void runEscrow(item, action)}
                  onSaveAmount={(dollars) => void saveAmount(item, dollars)}
                  onRefresh={() => void load()}
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
  onEscrow,
  onSaveAmount,
  onRefresh,
}: {
  item: AgentNegotiation
  updating: boolean
  onTransition: (to: NegotiationStatus) => void
  onEscrow: (action: 'approve' | 'capture' | 'cancel') => void
  onSaveAmount: (dollars: number) => void
  onRefresh?: () => void
}) {
  const escrowAvailable = item.escrow_mode !== 'not_configured'
  const transitions = getAllowedNegotiationTransitions(item.status, { escrowAvailable })
  const tone = getNegotiationStatusTone(item.status)
  const amountReady = item.amount_cents != null && item.amount_cents >= 50

  // The BUYER funds the hold (via the /negotiate pay link), so owners never set 'held'.
  // From 'held', the owner's complete = capture and decline = release the authorization.
  const isEscrowCapture = (to: NegotiationStatus) => escrowAvailable && item.status === 'held' && to === 'complete'
  const isEscrowRelease = (to: NegotiationStatus) => escrowAvailable && item.status === 'held' && to === 'declined'
  const ownerTransitions = transitions.filter((to) => to !== 'held')

  // Hybrid settlement at 'agreement_proposed': high value waits on owner approval,
  // low value (or approved) is just awaiting the buyer's payment.
  const awaitingApproval = item.status === 'agreement_proposed' && item.settlement_state === 'awaiting_approval'
  const buyerCanPay =
    item.status === 'agreement_proposed' && (item.settlement_state === 'auto' || item.settlement_state === 'approved')

  function handleAction(to: NegotiationStatus) {
    if (isEscrowCapture(to)) return onEscrow('capture')
    if (isEscrowRelease(to)) return onEscrow('cancel')
    return onTransition(to)
  }

  function labelFor(to: NegotiationStatus): string {
    if (isEscrowCapture(to)) return 'Capture funds'
    if (isEscrowRelease(to)) return 'Release hold'
    return TRANSITION_LABEL[to]
  }

  function iconFor(to: NegotiationStatus) {
    if (isEscrowCapture(to)) return <CheckCircle2 className="size-3.5" />
    return transitionIcon(to)
  }

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

      {/* Agreed amount — owner can confirm/adjust before approval or buyer payment. */}
      {item.status === 'agreement_proposed' && (
        <AmountEditor item={item} disabled={updating} onSave={onSaveAmount} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        {!escrowAvailable && (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <Lock className="size-3" /> Escrow needs Stripe
          </span>
        )}

        {/* High-value: owner must approve before the buyer's pay link activates. */}
        {awaitingApproval && (
          <button
            disabled={updating || !amountReady}
            onClick={() => onEscrow('approve')}
            title={!amountReady ? 'Set an agreed amount first.' : 'Approve so the buyer can pay to secure this agreement.'}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/20 disabled:opacity-50"
          >
            {updating ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
            Approve &amp; request payment
          </button>
        )}

        {/* Low-value / approved: nothing for the owner to do but wait on the buyer. */}
        {buyerCanPay && (
          <span className="inline-flex items-center gap-1 text-[11px] text-cyan-200/80">
            <Clock className="size-3" /> Awaiting buyer payment{item.settlement_state === 'auto' ? ' · auto-settle' : ''}
          </span>
        )}

        {ownerTransitions.length === 0 ? (
          <span className="text-xs text-zinc-500">Negotiation closed.</span>
        ) : (
          ownerTransitions.map((to) => (
            <button
              key={to}
              disabled={updating}
              onClick={() => handleAction(to)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-50 ${transitionTone(to)}`}
            >
              {updating ? <Loader2 className="size-3.5 animate-spin" /> : iconFor(to)}
              {labelFor(to)}
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
        <a href={`/negotiate/${item.id}`} className="inline-flex items-center gap-1 text-xs text-[#7C3AED] hover:underline">
          View full persistent thread →
        </a>
      </div>

      {/* Show recent LLM-powered history / reasoning for owner visibility (Phase 2: includes scope + scheduling hints) */}
      {(((item.metadata as any)?.conversation?.length > 0) || (item.metadata as any)?.proposal_review?.reasoning || (item.metadata as any)?.last_decision) && (
        <div className="mt-3 text-[11px] text-zinc-400 border-l border-white/20 pl-3">
          {((item.metadata as any)?.proposal_review as any)?.reasoning && <div>Initial: {((item.metadata as any).proposal_review as any).reasoning}</div>}
          {((item.metadata?.conversation as any[]) || []).slice(-2).map((t: any, idx: number) => t.decision && (
            <div key={idx}>{t.decision.action}: {t.decision.reasoning?.slice(0, 120)}...</div>
          ))}
          {(item.metadata as any)?.last_decision?.schedulingLink && (
            <div className="text-emerald-300/70">Scheduling link available for agent</div>
          )}
          {((item.metadata as any)?.last_decision?.counter?.scope || (item.metadata as any)?.last_decision?.scope) && (
            <div>Scope terms negotiated in thread</div>
          )}
        </div>
      )}

      {/* Owner manual message insertion UI - allows seller to manually continue/respond in the persistent negotiation */}
      {/* This inserts a row with role 'seller_owner' into negotiation_messages and updates status. */}
      {/* Complements the LLM-driven flow; full history (including manual) is visible on /negotiate/{id} for agents. */}
      {transitions.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <details className="group">
            <summary className="cursor-pointer text-xs text-[#7C3AED] hover:underline flex items-center gap-1">
              + Add manual response (as owner)
              <span className="text-[10px] text-zinc-500 group-open:hidden">(for testing / direct control)</span>
            </summary>
            <form
              className="mt-3 grid gap-3 text-xs"
              onSubmit={async (e) => {
                e.preventDefault()
                const form = e.currentTarget as HTMLFormElement
                const formData = new FormData(form)
                const action = (formData.get('action') as string) || 'counter'
                const reasoning = (formData.get('reasoning') as string) || 'Manual owner response.'
                const internalNotes = (formData.get('internal_notes') as string) || undefined

                const supabase = createClient()
                const content: any = { action, reasoning }
                if (internalNotes) content.internal_notes = internalNotes

                if (action === 'counter') {
                  const price = parseFloat(formData.get('proposed_price') as string)
                  if (!isNaN(price)) content.proposed_price = price
                  const date = formData.get('proposed_date') as string
                  if (date) content.proposed_date = date
                  const scope = formData.get('scope_notes') as string
                  if (scope) content.scope_notes = scope
                }
                if (action === 'clarify') {
                  const q = formData.get('clarification_questions') as string
                  if (q) content.questions = q.split(',').map((s) => s.trim()).filter(Boolean)
                }

                // Insert manual owner message into the dedicated table
                await supabase.from('negotiation_messages').insert({
                  negotiation_id: item.id,
                  role: 'seller_owner',
                  content,
                })

                // Map action to status and update the negotiation (owner can do this directly)
                let newStatus: NegotiationStatus = item.status
                if (action === 'accept') newStatus = 'agreement_proposed'
                else if (action === 'reject' || action === 'declined') newStatus = 'declined'
                else if (action === 'counter') newStatus = 'negotiation' // or 'agreement_proposed' if you prefer

                await supabase
                  .from('agent_negotiations')
                  .update({ status: newStatus, updated_at: new Date().toISOString() })
                  .eq('id', item.id)

                form.reset()
                if (onRefresh) onRefresh()
                else window.location.reload() // simple refresh for the inbox list
              }}
            >
              <div className="flex gap-2">
                <select name="action" className="input text-xs py-1" defaultValue="counter">
                  <option value="accept">Accept</option>
                  <option value="counter">Counter</option>
                  <option value="reject">Reject</option>
                  <option value="clarify">Request Clarification</option>
                </select>
                <input name="proposed_price" type="number" step="0.01" placeholder="Counter price (if counter)" className="input text-xs py-1 flex-1" />
              </div>
              <textarea name="reasoning" rows={2} placeholder="Reasoning (shown to agent)" className="input text-xs" required defaultValue="Manual response from owner." />
              <input name="proposed_date" placeholder="Proposed date/timeline (if counter)" className="input text-xs py-1" />
              <input name="scope_notes" placeholder="Scope adjustments (if counter)" className="input text-xs py-1" />
              <input name="clarification_questions" placeholder="Questions comma-separated (if clarify)" className="input text-xs py-1" />
              <textarea name="internal_notes" rows={1} placeholder="Internal notes (owner only, not sent to agent)" className="input text-xs" />
              <button type="submit" disabled={updating} className="btn-secondary text-xs py-1">
                {updating ? 'Saving...' : 'Insert manual owner message + update status'}
              </button>
              <p className="text-[10px] text-zinc-500">This appears in the persistent /negotiate thread for the agent with full history.</p>
            </form>
          </details>
        </div>
      )}
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

// Owner control to confirm/override the agreed amount. The engine sets this on
// accept/counter; an escrow hold can't authorize a card without it.
function AmountEditor({
  item,
  disabled,
  onSave,
}: {
  item: AgentNegotiation
  disabled: boolean
  onSave: (dollars: number) => void
}) {
  const [value, setValue] = useState(item.amount_cents != null ? (item.amount_cents / 100).toString() : '')
  const dollars = parseFloat(value)
  const valid = Number.isFinite(dollars) && dollars >= 0.5

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
      <label className="text-[11px] text-zinc-400">
        Agreed amount (USD)
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-sm text-zinc-500">$</span>
          <input
            type="number"
            step="0.01"
            min="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 800"
            className="input w-32 py-1 text-sm"
          />
        </div>
      </label>
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => onSave(dollars)}
        className="inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
      >
        Save amount
      </button>
      {item.amount_cents == null && (
        <span className="text-[11px] text-amber-300/80">Set this to enable the escrow hold.</span>
      )}
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
