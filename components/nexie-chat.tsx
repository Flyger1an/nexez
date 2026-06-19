'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  ChevronRight,
  Loader2,
  Mic,
  MicOff,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'

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

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  cards?: NexieCard[]
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
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'I am Nexxi, your buyer agent for Nexez. Tell me what you want to find, book, or negotiate and I will help you move.',
    },
  ])
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [notice, setNotice] = useState('')
  const recognitionRef = useRef<any>(null)

  const canSend = input.trim().length > 0 && !busy
  const lastCards = useMemo(() => messages.flatMap((message) => message.cards ?? []).slice(-6), [messages])

  useEffect(() => {
    function onQuickPrompt(event: Event) {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string') setInput(detail)
    }
    window.addEventListener('nexie:quick-prompt', onQuickPrompt)
    return () => window.removeEventListener('nexie:quick-prompt', onQuickPrompt)
  }, [])

  async function sendMessage(value = input, mode: 'text' | 'voice' = 'text') {
    const text = value.trim()
    if (!text || busy) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }
    setMessages((current) => [...current, userMessage])
    setInput('')
    setBusy(true)
    setNotice('')

    try {
      const response = await fetch('/api/agents/nexie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, threadId, mode }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Nexxi could not answer.')
      setThreadId(json.threadId)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: json.message,
          cards: json.cards ?? [],
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Nexxi could not answer.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  async function decide(card: Extract<NexieCard, { type: 'approval' }>, decision: 'approved' | 'rejected') {
    if (busy || card.status !== 'PENDING') return
    setBusy(true)
    setNotice(decision === 'approved' ? 'Running approved action...' : 'Declining action...')

    try {
      const response = await fetch('/api/agents/nexie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId, approval: { id: card.id, decision } }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Nexxi could not update the action.')
      setThreadId(json.threadId)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: json.message,
          cards: json.cards ?? [],
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Nexxi could not update the action.',
        },
      ])
    } finally {
      setBusy(false)
      setNotice('')
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    sendMessage()
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop?.()
      setListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setNotice('Voice input is not supported in this browser yet.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onstart = () => {
      setListening(true)
      setNotice('Listening...')
    }
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || '')
        .join(' ')
        .trim()
      setInput(transcript)
      if (event.results?.[event.results.length - 1]?.isFinal && transcript) {
        recognition.stop()
        sendMessage(transcript, 'voice')
      }
    }
    recognition.onerror = () => {
      setListening(false)
      setNotice('Voice capture stopped. Try again or type instead.')
    }
    recognition.onend = () => {
      setListening(false)
      setNotice('')
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  return (
    <section
      className={`mx-auto flex min-h-[720px] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/15 bg-[#07070A] text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] ${className}`}
    >
      <header className="relative border-b border-white/10 bg-white/[0.035] px-5 pb-4 pt-5 backdrop-blur-2xl">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--signal)] to-transparent" />
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-[var(--signal)]/40 bg-[var(--signal)]/15 shadow-[0_0_30px_rgba(45,212,191,0.18)]">
            <Sparkles className="size-5 text-[var(--signal)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-[-0.04em]">Nexxi</h1>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/55">
                buyer agent
              </span>
            </div>
            <p className="truncate text-sm text-white/55">Search, negotiate, book with approval.</p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[86%] ${message.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-3`}>
              <div
                className={
                  message.role === 'user'
                    ? 'rounded-3xl rounded-br-md bg-white px-4 py-3 text-sm leading-6 text-black shadow-lg'
                    : 'rounded-3xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-white/90 shadow-lg backdrop-blur-xl'
                }
              >
                {message.role === 'assistant' ? (
                  <div className="mb-2 flex items-center gap-2 text-xs text-[var(--signal)]">
                    <Bot className="size-3.5" />
                    Nexxi
                  </div>
                ) : null}
                {message.content}
              </div>
              {message.cards?.length ? (
                <div className="w-full space-y-3">
                  {message.cards.map((card) => (
                    <NexieCardView key={`${card.type}-${card.id}`} card={card} onDecision={decide} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {busy ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/60">
            <Loader2 className="size-4 animate-spin text-[var(--signal)]" />
            {notice || 'Nexxi is thinking...'}
          </div>
        ) : null}
      </div>

      {lastCards.length === 0 ? (
        <div className="grid gap-2 border-t border-white/10 px-4 py-3">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => sendMessage(starter)}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-sm text-white/75 transition hover:border-[var(--signal)]/50 hover:bg-[var(--signal)]/10"
            >
              <span>{starter}</span>
              <ChevronRight className="size-4 text-white/35" />
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="border-t border-white/10 bg-[#09090D]/95 p-4 backdrop-blur-2xl">
        {notice && !busy ? <div className="mb-2 text-xs text-white/50">{notice}</div> : null}
        <div className="flex items-end gap-2 rounded-3xl border border-white/12 bg-white/[0.045] p-2 shadow-inner">
          <button
            type="button"
            onClick={toggleVoice}
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border transition ${
              listening
                ? 'border-red-400/50 bg-red-500/15 text-red-200'
                : 'border-white/10 bg-black/40 text-white/70 hover:border-[var(--signal)]/40 hover:text-[var(--signal)]'
            }`}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          >
            {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={1}
            placeholder="Ask Nexxi to find, compare, negotiate, or book..."
            className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm leading-5 text-white outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--signal)] text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </button>
        </div>
        <p className="mt-2 px-2 text-[11px] leading-5 text-white/35">
          Nexxi asks before submitting offers or opening checkout. You stay in control.
        </p>
      </form>
    </section>
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
                View page
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
