import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { Handshake, Clock, Bot, User } from 'lucide-react'
import { formatNegotiationAmount } from '../../../lib/negotiations'

/**
 * Persistent Negotiation Page - /negotiate/{negotiation_id}?token={status_token}
 *
 * The core deliverable for long-lived, resumable negotiations: any AI agent (or
 * human) can bookmark this URL and return days later to the COMPLETE history and
 * continue the thread.
 *
 * agent_negotiations rows are owner-only under RLS, so this page is NOT readable
 * with the anonymous client. Two authorized read paths:
 *   1. Agent  — the status token (issued once at creation) is the credential.
 *               Service-role read filtered by id + token, mirroring
 *               /api/negotiations/status. Any mismatch → 404 (leaks nothing).
 *   2. Owner  — no token needed; the session client + RLS restricts to the
 *               owner's own negotiations (the dashboard "View full thread" link).
 *
 * Only a strict field allow-list is loaded, and owner-private data (the offer's
 * private pricing rules, the LLM's internal notes) is stripped before anything
 * is rendered for an agent.
 */

// The only negotiation columns this page may read. status_token is read solely
// to seed the continuation form's hidden field (the viewer is already authorized)
// and is never rendered. Deliberately absent: owner_id, buyer contact internals,
// requested_terms, currency, Stripe ids.
const NEGOTIATION_PAGE_SELECT =
  'id, slug, offer_key, offer_name, status, amount_cents, metadata, status_token, updated_at'

type NegotiationRow = {
  id: string
  slug: string
  offer_key: string
  offer_name: string
  status: string
  amount_cents: number | null
  metadata: any
  status_token: string | null
  updated_at: string | null
}

/** Drop the LLM's owner-only internal notes from a decision before it reaches an agent. */
function sanitizeDecision(decision: any, isOwner: boolean) {
  if (!decision || isOwner) return decision
  const { internalNotes: _internalNotes, ...safe } = decision
  return safe
}

/** Strip owner-private fields (private pricing rules, internal notes) from a turn for agents. */
function sanitizeTurn(turn: any, isOwner: boolean) {
  if (isOwner) return turn
  let content = turn.content
  if (content?.proposal?.rules) {
    const { rules: _rules, ...proposalSafe } = content.proposal
    content = { ...content, proposal: proposalSafe }
  }
  return { ...turn, content, decision: sanitizeDecision(turn.decision, isOwner) }
}

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ token?: string }>
}

export default async function PersistentNegotiationPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const token = (sp?.token || '').trim()

  const cookieStore = await cookies()
  const serverClient = createClient(cookieStore)
  const admin = hasSupabaseAdminEnv() ? createAdminClient() : null

  let negotiation: NegotiationRow | null = null
  let viewerIsOwner = false

  // Agent path: the status token is the credential. Service-role read scoped to
  // id + token so a wrong/missing token (or a guessed id) resolves to nothing.
  if (token && admin) {
    const { data } = await admin
      .from('agent_negotiations')
      .select(NEGOTIATION_PAGE_SELECT)
      .eq('id', id)
      .eq('status_token', token)
      .maybeSingle<NegotiationRow>()
    negotiation = data ?? null
  }

  // Owner path: no token — RLS on the session client restricts to their own rows.
  if (!negotiation) {
    const { data } = await serverClient
      .from('agent_negotiations')
      .select(NEGOTIATION_PAGE_SELECT)
      .eq('id', id)
      .maybeSingle<NegotiationRow>()
    if (data) {
      negotiation = data
      viewerIsOwner = true
    }
  }

  if (!negotiation) {
    // No valid token and not the owner → 404, identical for "wrong token" and
    // "does not exist" so the endpoint reveals nothing about which threads exist.
    notFound()
  }

  // Full history. The viewer is already authorized, so read with the service-role
  // client when available (RLS-free, consistent for both paths); fall back to the
  // session client (owner RLS) for deployments without a service-role key.
  const historyReader = admin ?? serverClient
  const { data: messageRows } = await historyReader
    .from('negotiation_messages')
    .select('id, role, content, created_at')
    .eq('negotiation_id', id)
    .order('created_at', { ascending: true })

  const history: any[] = (messageRows || []).map((row: any) =>
    sanitizeTurn(
      {
        id: row.id,
        timestamp: row.created_at,
        role: row.role,
        content: row.content,
        decision: row.content?.decision,
      },
      viewerIsOwner,
    ),
  )

  const rawLastDecision =
    negotiation.metadata?.last_decision || (history.length > 0 ? history[history.length - 1]?.decision : null)
  const lastDecision = sanitizeDecision(rawLastDecision, viewerIsOwner)

  // Credential for the continuation form: the API now requires the token to resume
  // a thread. The agent already has it (URL); the owner gets their own stored token.
  const formToken = viewerIsOwner ? negotiation.status_token || '' : token

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Handshake className="size-8 text-[#7C3AED]" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Negotiation</h1>
            <p className="text-sm text-zinc-400 font-mono">{id}</p>
          </div>
        </div>

        <div className="card mb-8">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-zinc-400">For offer</div>
              <div className="text-xl font-medium">{negotiation.offer_name}</div>
              <div className="text-sm text-zinc-500">/{negotiation.slug}</div>
            </div>
            <div className="text-right">
              <div className="uppercase text-[10px] tracking-[2px] text-zinc-500">Current Status</div>
              <div className="text-lg font-semibold text-emerald-300">{negotiation.status}</div>
              {negotiation.amount_cents && (
                <div className="text-sm">{formatNegotiationAmount(negotiation.amount_cents)}</div>
              )}
            </div>
          </div>
        </div>

        {lastDecision && (lastDecision.counter || lastDecision.schedulingLink || lastDecision.scope) && (
          <div className="card mb-6 border border-[#7C3AED]/30">
            <div className="text-xs uppercase tracking-widest text-[#7C3AED] mb-1">Current proposed terms (from intelligent engine)</div>
            {lastDecision.counter && (
              <div className="text-sm">
                {lastDecision.counter.priceCents != null && <span>Price: ${(lastDecision.counter.priceCents/100).toFixed(2)} </span>}
                {lastDecision.counter.proposedDate && <span>· Date: {lastDecision.counter.proposedDate} </span>}
              </div>
            )}
            {lastDecision.schedulingLink && (
              <a href={lastDecision.schedulingLink} target="_blank" rel="noreferrer" className="text-sm underline text-emerald-300">Reserve this via Calendly/scheduling link →</a>
            )}
            {(lastDecision.scope || lastDecision.counter?.scope) && (
              <div className="text-xs text-zinc-400 mt-1">Scope adjustments active in thread (see history for details).</div>
            )}
          </div>
        )}

        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Clock className="size-5" /> Full Conversation History
          <span className="text-xs text-zinc-500 font-normal">(persistent &amp; resumable)</span>
        </h2>

        {history.length === 0 && (
          <div className="card text-zinc-400">No turns recorded yet. Submit a proposal to start the intelligent negotiation.</div>
        )}

        <div className="space-y-4">
          {history.map((turn, index) => (
            <div key={turn.id || index} className="card flex gap-4">
              <div className="mt-1">
                {turn.role === 'buyer' ? (
                  <User className="size-5 text-cyan-400" />
                ) : (
                  <Bot className="size-5 text-[#7C3AED]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span className="font-medium">{turn.role === 'buyer' ? 'Buying Agent' : 'Nexez Negotiation Assistant (LLM)'}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{new Date(turn.timestamp).toLocaleString()}</span>
                </div>

                {turn.content?.query && <p className="text-sm mb-2">{turn.content.query}</p>}
                {turn.content?.proposedPriceCents != null && (
                  <p className="text-sm">Proposed: ${ (turn.content.proposedPriceCents / 100).toFixed(2) }</p>
                )}

                {turn.decision && (
                  <div className="mt-3 border-l-2 border-[#7C3AED] pl-3 text-sm">
                    <div className="font-semibold text-[#7C3AED] uppercase tracking-widest text-[10px]">{turn.decision.action}</div>
                    <p className="mt-1 text-zinc-300">{turn.decision.reasoning}</p>
                    {turn.decision.counter && (
                      <div className="mt-2 text-xs bg-black/30 p-2 rounded">
                        Counter: ${turn.decision.counter.priceCents ? (turn.decision.counter.priceCents / 100).toFixed(2) : turn.decision.counter.price}
                        {turn.decision.counter.proposedDate && ` · ${turn.decision.counter.proposedDate}`}
                        {turn.decision.counter.scopeNotes && <div className="mt-1">Scope: {turn.decision.counter.scopeNotes}</div>}
                        {turn.decision.counter.scope && (
                          <div className="mt-1 text-[10px] text-zinc-400">
                            {turn.decision.counter.scope.included && <div>Incl: {turn.decision.counter.scope.included}</div>}
                            {turn.decision.counter.scope.excluded && <div>Excl: {turn.decision.counter.scope.excluded}</div>}
                            {(turn.decision.counter.scope.maxRevisions != null || turn.decision.counter.scope.maxProjectWeeks != null) && (
                              <div>Revisions/Weeks: {turn.decision.counter.scope.maxRevisions ?? '–'} / {turn.decision.counter.scope.maxProjectWeeks ?? '–'}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {turn.decision.scope && !turn.decision.counter && (
                      <div className="mt-1 text-[10px] text-emerald-300/80">
                        Scope: {turn.decision.scope.included || turn.decision.scope.excluded ? `${turn.decision.scope.included || ''} ${turn.decision.scope.excluded ? ' / excl ' + turn.decision.scope.excluded : ''}` : 'see reasoning'}
                      </div>
                    )}
                    {turn.decision.schedulingLink && (
                      <a href={turn.decision.schedulingLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline text-[#7C3AED] hover:text-white">
                        Book concrete slot via Calendly / scheduling link →
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Continuation form for the agent to keep the conversation going */}
        <div className="mt-12 card">
          <h3 className="font-semibold mb-2">Continue this negotiation</h3>
          <p className="text-sm text-zinc-400 mb-4">Submit a follow-up proposal, counter, or clarification. The LLM will remember the entire history.</p>

          <form method="post" action="/api/negotiations" className="grid gap-4">
            <input type="hidden" name="slug" value={negotiation.slug} />
            <input type="hidden" name="offer" value={negotiation.offer_key} />
            <input type="hidden" name="negotiationId" value={id} />
            {formToken && <input type="hidden" name="statusToken" value={formToken} />}

            <textarea name="query" rows={3} className="input" placeholder="Updated scope, new constraints, or response to previous counter..." required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input name="budget" className="input" placeholder="Updated budget e.g. 820" />
              <input name="timeline" className="input" placeholder="New timeline" />
            </div>
            <input name="contact" className="input" placeholder="Your contact (optional)" />

            <button type="submit" className="btn-primary">Submit follow-up to the negotiation engine</button>
            <p className="text-[10px] text-zinc-500">This will append to the history above and invoke the intelligent LLM with full context.</p>
          </form>
        </div>

        <div className="mt-8 text-xs text-zinc-500">
          This link is your persistent negotiation thread. Bookmark it. The seller will also see the full history in their dashboard.
        </div>
      </div>
    </main>
  )
}
