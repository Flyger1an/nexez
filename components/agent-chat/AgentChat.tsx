'use client'

// Shared agent-chat shell (spec §6): factored out of nexie-chat.tsx so the
// buyer (Nexxi) and seller (intake) agents share ONE chat system. The markup
// and classes are lifted verbatim from the shipped Nexie surface; everything
// agent-specific (name, copy, endpoint, cards) arrives via AgentChatConfig.
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChevronRight, Loader2, Mic, MicOff, Send, Sparkles } from 'lucide-react'
import type { AgentChatConfig, AgentChatController, AgentChatMessage, AgentTurnResponse } from './types'

type AgentChatProps<TCard> = {
  config: AgentChatConfig<TCard>
  className?: string
}

export function AgentChat<TCard>({ config, className = '' }: AgentChatProps<TCard>) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AgentChatMessage<TCard>[]>(
    config.initialMessages?.length
      ? config.initialMessages
      : [{ id: 'welcome', role: 'assistant', content: config.welcome }],
  )
  const [busy, setBusy] = useState(false)
  // True once the first streamed token has landed (a live bubble is rendering),
  // so the generic "thinking" indicator yields to the progressive reply.
  const [streaming, setStreaming] = useState(false)
  const [listening, setListening] = useState(false)
  const [notice, setNotice] = useState('')
  const recognitionRef = useRef<any>(null)
  // The scrollable transcript. As the interview grows, turns scroll INSIDE the
  // card rather than stretching the page — see the height cap on the section
  // below. `pinnedRef` tracks whether the view is at the bottom so we auto-follow
  // new turns without yanking a reader who has scrolled up to review history.
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  const errorFallback = config.errorFallback ?? `${config.agentName} could not answer.`
  const canSend = input.trim().length > 0 && !busy
  const lastCards = useMemo(() => messages.flatMap((message) => message.cards ?? []).slice(-6), [messages])

  useEffect(() => {
    if (!config.quickPromptEvent) return
    function onQuickPrompt(event: Event) {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string') setInput(detail)
    }
    window.addEventListener(config.quickPromptEvent, onQuickPrompt)
    return () => window.removeEventListener(config.quickPromptEvent!, onQuickPrompt)
  }, [config.quickPromptEvent])

  // Follow the newest turn as messages (or streamed tokens, which mutate the
  // messages array) arrive — but only while the reader is pinned to the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  function onScrollTranscript() {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function appendAssistant(content: string, cards?: TCard[]) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content, cards }])
  }

  // Replace an existing (streamed) assistant bubble by id, or append a fresh one
  // when no live bubble exists (e.g. an error before any token arrived).
  function settleAssistant(id: string | null, content: string, cards?: TCard[]) {
    setMessages((current) => {
      if (id && current.some((m) => m.id === id)) {
        return current.map((m) => (m.id === id ? { ...m, content, cards: cards ?? m.cards } : m))
      }
      return [...current, { id: crypto.randomUUID(), role: 'assistant', content, cards }]
    })
  }

  async function sendMessage(value = input, mode: 'text' | 'voice' = 'text') {
    const text = value.trim()
    if (!text || busy) return

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: text }])
    setInput('')
    setBusy(true)
    setNotice('')

    if (config.streamTurn) {
      // One turn runs at a time (guarded by `busy`), so the live bubble's id is a
      // plain closure local — no ref needed. First token appends the bubble;
      // later tokens grow it.
      let streamingId: string | null = null
      const onToken = (delta: string) => {
        if (!delta) return
        if (!streamingId) {
          streamingId = crypto.randomUUID()
          const id = streamingId
          setStreaming(true)
          setMessages((current) => [...current, { id, role: 'assistant', content: delta }])
        } else {
          const id = streamingId
          setMessages((current) => current.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)))
        }
      }
      try {
        const response = await config.streamTurn({ text, mode }, { onToken })
        // The resolved response is authoritative — swap the streamed preview for
        // the final message + cards (the preview may omit tool-driven content).
        settleAssistant(streamingId, response.message, response.cards ?? [])
      } catch (error) {
        settleAssistant(streamingId, error instanceof Error && error.message ? error.message : errorFallback)
      } finally {
        setStreaming(false)
        setBusy(false)
      }
      return
    }

    try {
      const response = await config.sendTurn({ text, mode })
      appendAssistant(response.message, response.cards ?? [])
    } catch (error) {
      appendAssistant(error instanceof Error && error.message ? error.message : errorFallback)
    } finally {
      setBusy(false)
    }
  }

  async function runAction(actionNotice: string, action: () => Promise<AgentTurnResponse<TCard>>) {
    if (busy) return
    setBusy(true)
    setNotice(actionNotice)
    try {
      const response = await action()
      appendAssistant(response.message, response.cards ?? [])
    } catch (error) {
      appendAssistant(error instanceof Error && error.message ? error.message : errorFallback)
    } finally {
      setBusy(false)
      setNotice('')
    }
  }

  const controller: AgentChatController<TCard> = {
    busy,
    setInput,
    send: (text: string) => void sendMessage(text),
    runAction,
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
      // `end` always fires AFTER `error` - clear only the transient listening
      // notice so the error message above survives long enough to be read.
      setNotice((current) => (current === 'Listening...' ? '' : current))
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      // start() throws synchronously on permission/security/invalid-state
      // failures (e.g. embedded webviews) - fall back to typing, don't crash.
      recognitionRef.current = null
      setListening(false)
      setNotice('Voice capture could not start. Try again or type instead.')
    }
  }

  return (
    <section
      className={`mx-auto flex h-[720px] max-h-[calc(100dvh_-_6rem)] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-[var(--bd-15)] bg-[var(--panel)] text-[var(--fg)] shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:border-white/15 dark:bg-[#07070A] dark:text-white dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)] ${className}`}
    >
      <header className="relative border-b border-[var(--bd-10)] bg-[var(--ov-03)] px-5 pb-4 pt-5 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.035]">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--signal)] to-transparent" />
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-[var(--signal)]/40 bg-[var(--signal)]/15 shadow-[0_0_30px_rgba(45,212,191,0.18)]">
            {config.headerIcon ?? <Sparkles className="size-5 text-[var(--signal)]" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-[-0.04em]">{config.agentName}</h1>
              {config.badge ? (
                <span className="rounded-full border border-[var(--bd-10)] bg-[var(--ov-05)] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-muted)] dark:border-white/10 dark:bg-white/5 dark:text-white/55">
                  {config.badge}
                </span>
              ) : null}
            </div>
            {config.tagline ? <p className="truncate text-sm text-[var(--fg-muted)] dark:text-white/55">{config.tagline}</p> : null}
          </div>
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScrollTranscript} className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[86%] ${message.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-3`}>
              <div
                className={
                  message.role === 'user'
                    ? 'rounded-3xl rounded-br-md bg-[var(--inverse-bg)] px-4 py-3 text-sm leading-6 text-[var(--inverse-fg)] shadow-lg'
                    : 'rounded-3xl rounded-bl-md border border-[var(--bd-10)] bg-[var(--ov-04)] px-4 py-3 text-sm leading-6 text-[var(--fg)] shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045] dark:text-white/90'
                }
              >
                {message.role === 'assistant' ? (
                  <div className="mb-2 flex items-center gap-2 text-xs text-[var(--signal)]">
                    <Bot className="size-3.5" />
                    {config.agentName}
                  </div>
                ) : null}
                {message.content}
              </div>
              {message.cards?.length ? (
                <div className="w-full space-y-3">
                  {message.cards.map((card) => (
                    <div key={config.cardKey(card)}>{config.renderCard(card, controller)}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {busy && !streaming ? (
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--bd-10)] bg-[var(--ov-03)] px-4 py-3 text-sm text-[var(--fg-muted)] dark:border-white/10 dark:bg-white/[0.035] dark:text-white/60">
            <Loader2 className="size-4 animate-spin text-[var(--signal)]" />
            {notice || `${config.agentName} is thinking...`}
          </div>
        ) : null}
      </div>

      {config.starters?.length && lastCards.length === 0 ? (
        <div className="grid gap-2 border-t border-white/10 px-4 py-3">
          {config.starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => sendMessage(starter)}
              className="flex items-center justify-between rounded-2xl border border-[var(--bd-10)] bg-[var(--ov-03)] px-4 py-3 text-left text-sm text-[var(--fg-soft)] transition hover:border-[var(--signal)]/50 hover:bg-[var(--signal)]/10 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/75"
            >
              <span>{starter}</span>
              <ChevronRight className="size-4 text-[var(--fg-muted)] dark:text-white/35" />
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="border-t border-[var(--bd-10)] bg-[var(--bg-2)] p-4 backdrop-blur-2xl dark:border-white/10 dark:bg-[#09090D]/95">
        {notice && !busy ? <div className="mb-2 text-xs text-[var(--fg-muted)] dark:text-white/50">{notice}</div> : null}
        <div className="flex items-end gap-2 rounded-3xl border border-[var(--bd-15)] bg-[var(--panel)] p-2 shadow-inner dark:border-white/12 dark:bg-white/[0.045]">
          {config.voice !== false ? (
            <button
              type="button"
              onClick={toggleVoice}
              className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border transition ${
                listening
                  ? 'border-red-400/50 bg-red-500/15 text-red-200'
                  : 'border-[var(--bd-10)] bg-[var(--ov-05)] text-[var(--fg-muted)] hover:border-[var(--signal)]/40 hover:text-[var(--signal)] dark:border-white/10 dark:bg-black/40 dark:text-white/70'
              }`}
              aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            >
              {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
          ) : null}
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={1}
            placeholder={config.placeholder ?? 'Type a message...'}
            className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm leading-5 text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)] dark:text-white dark:placeholder:text-white/35"
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
        {config.footnote ? <p className="mt-2 px-2 text-[11px] leading-5 text-[var(--fg-muted)] dark:text-white/35">{config.footnote}</p> : null}
      </form>
    </section>
  )
}
