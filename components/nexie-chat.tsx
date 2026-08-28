'use client'

// Nexxi (buyer agent) web chat - a thin client of the shared agent-chat
// primitive (components/agent-chat). This file owns only what is Nexxi's:
// the card types + renderers, the /api/agents/nexie endpoint wiring, and the
// thread id. The shell (messages, busy states, starters, mic, composer) is
// the shared primitive - one chat system, two agents (spec §6).
import { useRef } from 'react'
import { Check, ChevronRight, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { AgentChat, type AgentChatController, type AgentTurnResponse } from './agent-chat'

type NexieCard =
  | {
      type: 'page_result'
      id: string
      title: string
      subtitle: string
      description: string | null
      price: string | null
      slug: string
      url: string
      agentJsonUrl: string
      offerKey: string | null
      offerName: string | null
      checkoutUrl: string | null
      score: number
    }
  | {
      type: 'approval'
      id: string
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED'
      toolName: 'initiate_negotiation' | 'trigger_booking'
      title: string
      summary: string
      payload: Record<string, unknown>
    }
  | {
      type: 'action_result'
      id: string
      title: string
      status: 'success' | 'error'
      description: string
      url?: string
      metadata?: Record<string, unknown>
    }

type NexieChatProps = {
  initialThreadId?: string
  className?: string
}

const starters = [
  'Find a local brand photographer under $500',
  'Negotiate a strategy session for next week',
  'Book the best AI-ready consultant for a launch plan',
]

export function NexieChat({ initialThreadId, className = '' }: NexieChatProps) {
  const threadIdRef = useRef<string | undefined>(initialThreadId)

  async function postTurn(body: Record<string, unknown>): Promise<AgentTurnResponse<NexieCard>> {
    const response = await fetch('/api/agents/nexie', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, threadId: threadIdRef.current }),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || 'Nexxi could not answer.')
    threadIdRef.current = json.threadId
    return { message: json.message, cards: json.cards ?? [] }
  }

  // Streaming turn over the SSE route: tokens render progressively via onToken;
  // the `done` frame is authoritative (message + cards + threadId). Falls back
  // to the JSON route only when the browser/network cannot provide a readable
  // stream. Real route errors still surface so auth/rate limits are not retried.
  async function streamTurn(
    { text, mode }: { text: string; mode: 'text' | 'voice' },
    { onToken }: { onToken: (delta: string) => void },
  ): Promise<AgentTurnResponse<NexieCard>> {
    let response: Response
    try {
      response = await fetch('/api/agents/nexie/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, mode, threadId: threadIdRef.current }),
      })
    } catch {
      return postTurn({ message: text, mode })
    }

    if (!response.ok) {
      const json = await response.json().catch(() => ({}))
      throw new Error((json as { error?: string }).error || 'Nexxi could not answer.')
    }
    if (!response.body) return postTurn({ message: text, mode })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let final: AgentTurnResponse<NexieCard> | null = null
    let streamError: string | null = null

    const handleFrame = (frame: string) => {
      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'))
      if (!dataLine) return
      const payload = dataLine.slice(5).trim()
      if (!payload) return
      let evt: { type?: string; value?: string; error?: string; threadId?: string; message?: string; cards?: NexieCard[] }
      try {
        evt = JSON.parse(payload)
      } catch {
        return
      }
      if (evt.type === 'token') onToken(evt.value ?? '')
      else if (evt.type === 'done') {
        threadIdRef.current = evt.threadId ?? threadIdRef.current
        final = { message: evt.message ?? '', cards: evt.cards ?? [] }
      } else if (evt.type === 'error') streamError = evt.error || 'Nexxi could not answer.'
    }

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE frames are separated by a blank line.
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        handleFrame(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
      }
    }
    if (buffer.trim()) handleFrame(buffer) // flush a trailing unterminated frame

    if (streamError) throw new Error(streamError)
    if (!final) throw new Error('Nexxi could not answer.')
    return final
  }

  function decide(
    controller: AgentChatController<NexieCard>,
    card: Extract<NexieCard, { type: 'approval' }>,
    decision: 'approved' | 'rejected',
  ) {
    if (card.status !== 'PENDING') return
    void controller.runAction(decision === 'approved' ? 'Running approved action...' : 'Declining action...', () =>
      postTurn({ approval: { id: card.id, decision } }),
    )
  }

  return (
    <AgentChat<NexieCard>
      className={className}
      config={{
        agentName: 'Nexxi',
        badge: 'buyer agent',
        tagline: 'Search, negotiate, book with approval.',
        welcome:
          'I am Nexxi, your buyer agent for Nexez. Tell me what you want to find, book, or negotiate and I will help you move.',
        starters,
        placeholder: 'Ask Nexxi to find, compare, negotiate, or book...',
        footnote: 'Nexxi asks before submitting offers or opening checkout. You stay in control.',
        headerIcon: <Sparkles className="size-5 text-[var(--signal)]" />,
        quickPromptEvent: 'nexie:quick-prompt',
        errorFallback: 'Nexxi could not answer.',
        sendTurn: ({ text, mode }) => postTurn({ message: text, mode }),
        streamTurn,
        cardKey: (card) => `${card.type}-${card.id}`,
        renderCard: (card, controller) => (
          <NexieCardView card={card} onDecision={(c, decision) => decide(controller, c, decision)} />
        ),
      }}
    />
  )
}

function NexieCardView({
  card,
  onDecision,
}: {
  card: NexieCard
  onDecision: (card: Extract<NexieCard, { type: 'approval' }>, decision: 'approved' | 'rejected') => void
}) {
  if (card.type === 'page_result') {
    return (
      <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-xl backdrop-blur-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--signal)]/15 text-[var(--signal)]">
            <Search className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold leading-5 text-white">{card.title}</h3>
                <p className="mt-0.5 text-xs text-white/45">/{card.slug} · {card.subtitle}</p>
              </div>
              {card.price ? (
                <span className="rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-2 py-1 text-xs font-medium text-[var(--signal)]">
                  {card.price}
                </span>
              ) : null}
            </div>
            {card.description ? <p className="mt-3 line-clamp-3 text-xs leading-5 text-white/60">{card.description}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={card.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 transition hover:border-[var(--signal)]/40 hover:text-[var(--signal)]"
              >
                View listing
              </a>
              {card.checkoutUrl ? (
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 transition hover:border-[var(--signal)]/40 hover:text-[var(--signal)]"
                  onClick={() => {
                    const prompt = `Help me book ${card.offerName || card.title} on /${card.slug} using offer ${card.offerKey}.`
                    window.dispatchEvent(new CustomEvent('nexie:quick-prompt', { detail: prompt }))
                  }}
                >
                  Ask Nexxi to book
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    )
  }

  if (card.type === 'approval') {
    const locked = card.status !== 'PENDING'
    return (
      <article className="rounded-3xl border border-[var(--signal)]/25 bg-[var(--signal)]/10 p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-black/35 text-[var(--signal)]">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">{card.title}</h3>
              <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                {card.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/65">{card.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => onDecision(card, 'rejected')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-xs font-medium text-white/70 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-45"
              >
                <X className="size-4" />
                Decline
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => onDecision(card, 'approved')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--signal)] px-3 py-3 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-45"
              >
                <Check className="size-4" />
                Approve
              </button>
            </div>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article
      className={`rounded-3xl border p-4 shadow-xl ${
        card.status === 'success'
          ? 'border-[var(--ready)]/20 bg-[var(--ready)]/10'
          : 'border-red-400/20 bg-red-400/10'
      }`}
    >
      <h3 className="text-sm font-semibold text-white">{card.title}</h3>
      <p className="mt-2 text-xs leading-5 text-white/65">{card.description}</p>
      {card.url ? (
        <a
          href={card.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 transition hover:border-[var(--signal)]/40 hover:text-[var(--signal)]"
        >
          Open link
          <ChevronRight className="size-3.5" />
        </a>
      ) : null}
    </article>
  )
}
