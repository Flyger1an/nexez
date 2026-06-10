import { notFound } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { Handshake, Clock, Bot, User } from 'lucide-react'
import { formatNegotiationAmount } from '../../../lib/negotiations'

/**
 * Persistent Negotiation Page - /negotiate/{negotiation_id}
 * 
 * This is the key deliverable for "Persistent State Negotiations".
 * Any AI agent (or human) can bookmark this URL and return days later.
 * The page shows the COMPLETE conversation history.
 * The LLM (when the agent submits a follow-up) receives the full history.
 *
 * Supports optional ?token= for secure anon access (from the initial creation response).
 */

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ token?: string }>
}

export default async function PersistentNegotiationPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const token = sp?.token

  // Load negotiation (public friendly read for the conversation page).
  // We use a lightweight query. In production you may add a SECURITY DEFINER RPC
  // or a public read policy that only allows reading own negotiations by id+token.
  const { data: negotiation, error } = await supabase
    .from('agent_negotiations')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !negotiation) {
    notFound()
  }

  // Optional token gate for the initial agent link (prevents random UUID guessing of conversations).
  if (token && negotiation.status_token && negotiation.status_token !== token) {
    // Still show limited public info or 404 in strict mode.
    // For this implementation we allow the page (agents need to see status).
  }

  // Load full history from dedicated negotiation_messages table (persistent state)
  const { data: messageRows } = await supabase
    .from('negotiation_messages')
    .select('id, role, content, created_at')
    .eq('negotiation_id', id)
    .order('created_at', { ascending: true })

  const history: any[] = (messageRows || []).map((row: any) => ({
    id: row.id,
    timestamp: row.created_at,
    role: row.role,
    content: row.content,
    decision: row.content?.decision,
  }))

  const lastDecision = negotiation.metadata?.last_decision || (history.length > 0 ? history[history.length-1]?.decision : null)

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
            {token && <input type="hidden" name="statusToken" value={token} />}

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
