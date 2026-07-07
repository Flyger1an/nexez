'use client'

// Seller intake interview: web client (spec §6). A thin client of the shared
// agent-chat primitive over the threads API: no interview logic lives here.
// The reducer on the server decides what is askable; this component renders
// turns + cards and posts owner input (free text, or structured quick-answers
// from gap_batch chips, which work with or without a configured LLM).
//
// Color rubric (current brand, not the spec draft's periwinkle): teal --ready
// carries readiness/positive, amber --amber flags blocking gaps, persimmon
// --signal stays on interactive accents.
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleCheck, Globe2, ListChecks, Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react'
import { AgentChat, type AgentChatController, type AgentChatMessage, type AgentTurnResponse } from '../agent-chat'
import type { IntakeCard } from '../../lib/agents/intake'
import type { Gap, GapAnswer, IntakeState } from '../../lib/intake'
import { appUrl } from '../../lib/site'

type IntakeChatProps = {
  /** "Just take me to the form": the fork's escape hatch. */
  onSwitchToForm?: () => void
  /** Re-interview an EXISTING listing: the session seeds from the page and
   *  commit stages onto its draft (never a new page). Entry: the editor's
   *  Re-interview action -> /create?reinterview=<pageId>. */
  reinterviewPageId?: string
  className?: string
}

type SetupPhase = 'setup' | 'starting' | 'signin' | 'chat'

type ActiveSession = { id: string; updatedAt: string | null }

export function IntakeChat({ onSwitchToForm, reinterviewPageId, className = '' }: IntakeChatProps) {
  const [phase, setPhase] = useState<SetupPhase>('setup')
  const [sourceUrl, setSourceUrl] = useState('')
  const [setupError, setSetupError] = useState('')
  const [resumable, setResumable] = useState<ActiveSession | null>(null)
  const [initialMessages, setInitialMessages] = useState<AgentChatMessage<IntakeCard>[]>([])
  const sessionIdRef = useRef<string | null>(null)

  // Surface an existing interview so a second visit resumes instead of
  // duplicating (cross-device: start on mobile, finish here). Best-effort:
  // unauthenticated visitors just see the fresh-start setup. In re-interview
  // mode only a session for THAT listing counts.
  useEffect(() => {
    let cancelled = false
    fetch('/api/agents/intake/threads')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.sessions?.length) return
        const sessions = json.sessions as Array<{ id: string; pageId: string | null; updatedAt: string | null }>
        const match = reinterviewPageId ? sessions.find((s) => s.pageId === reinterviewPageId) : sessions[0]
        if (match) setResumable({ id: match.id, updatedAt: match.updatedAt ?? null })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reinterviewPageId])

  function openingMessages(state: IntakeState): AgentChatMessage<IntakeCard>[] {
    const extraction = state.extractions[0]
    const cards: IntakeCard[] = []
    if (extraction) {
      cards.push({
        type: 'source_ingested',
        sourceId: extraction.sourceId,
        label: state.sources.find((s) => s.id === extraction.sourceId)?.label || 'your site',
        offers: extraction.offers.length,
        confidence: extraction.confidence,
      })
    }
    if (state.gaps.length > 0) {
      cards.push({ type: 'gap_batch', gaps: state.gaps.slice(0, 3) })
    }
    const intro = extraction
      ? `I read what your site already says. ${extraction.offers.length} offer${extraction.offers.length === 1 ? '' : 's'} came through, and I will only ask about what is missing or unclear.`
      : state.draft.name.trim()
        ? `I re-read ${state.draft.name}. It is already on Nexez, so I will only ask about what is missing or could be stronger. Your answers land as a draft on the listing.`
        : 'We are starting fresh. A few focused questions and your draft will be ready to review in the builder. Answer, skip, or jump to the form any time.'
    return [{ id: 'intake-opening', role: 'assistant', content: intro, cards }]
  }

  function transcriptMessages(state: IntakeState): AgentChatMessage<IntakeCard>[] {
    const replay: AgentChatMessage<IntakeCard>[] = state.messages.map((m) => ({
      id: m.id,
      role: m.role === 'owner' ? 'user' : 'assistant',
      content: m.content,
    }))
    if (state.gaps.length > 0) {
      replay.push({
        id: 'intake-resume-gaps',
        role: 'assistant',
        content: 'Picking up where we left off:',
        cards: [{ type: 'gap_batch', gaps: state.gaps.slice(0, 3) }],
      })
    }
    return replay.length ? replay : openingMessages(state)
  }

  async function start(body: Record<string, unknown>) {
    setPhase('starting')
    setSetupError('')
    try {
      const response = await fetch('/api/agents/intake/threads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json()
      if (response.status === 401) {
        setPhase('signin')
        return
      }
      if (!response.ok) throw new Error(json.error || 'Could not start the interview.')
      sessionIdRef.current = json.id
      setInitialMessages(openingMessages(json.state as IntakeState))
      setPhase('chat')
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Could not start the interview.')
      setPhase('setup')
    }
  }

  async function resume(id: string) {
    setPhase('starting')
    setSetupError('')
    try {
      const response = await fetch(`/api/agents/intake/threads/${id}`)
      const json = await response.json()
      if (response.status === 401) {
        setPhase('signin')
        return
      }
      if (!response.ok) throw new Error(json.error || 'Could not resume the interview.')
      sessionIdRef.current = json.id
      setInitialMessages(transcriptMessages(json.state as IntakeState))
      setPhase('chat')
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Could not resume the interview.')
      setPhase('setup')
    }
  }

  async function postTurn(body: Record<string, unknown>): Promise<AgentTurnResponse<IntakeCard>> {
    const response = await fetch(`/api/agents/intake/threads/${sessionIdRef.current}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || 'The interview hit a snag. Try again.')
    return { message: json.message, cards: json.cards ?? [] }
  }

  async function commit() {
    const response = await fetch(`/api/agents/intake/threads/${sessionIdRef.current}/commit`, { method: 'POST' })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || 'Could not open the builder.')
    window.location.href = appUrl(json.builderPath || `/dashboard/${json.pageId}`)
    return { message: 'Opening your draft in the builder...' }
  }

  if (phase !== 'chat') {
    return (
      <section className={`mx-auto flex min-h-[720px] w-full max-w-md flex-col justify-center overflow-hidden rounded-[2rem] border border-[var(--bd-15)] bg-[var(--panel)] p-8 text-[var(--fg)] shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:border-white/15 dark:bg-[#07070A] dark:text-white dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)] ${className}`}>
        <div className="flex size-12 items-center justify-center rounded-2xl border border-[var(--signal)]/40 bg-[var(--signal)]/15">
          <Sparkles className="size-6 text-[var(--signal)]" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
          {reinterviewPageId ? 'Re-interview this listing' : 'Talk it through'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">
          {reinterviewPageId
            ? 'Nexez re-reads what the listing already says and only asks about what is missing or could be stronger. Your answers land as a draft on the listing. Nothing goes live without you.'
            : 'I will read what already exists: your site and your listings. Then I only ask about the gaps. Twenty minutes of conversation, not forty form fields.'}
        </p>

        {phase === 'signin' ? (
          <div className="mt-6 rounded-2xl border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-4 text-sm leading-6 text-[var(--fg-soft)]">
            Sign in to start your interview. Your progress saves to your account and resumes on any device.
            <div className="mt-3 flex flex-col gap-2">
              <a href="/onboard?next=/create" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white font-medium text-zinc-950 hover:bg-zinc-200">
                Start your free trial
              </a>
              <a href="/login?next=/create" className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--bd-15)] text-sm text-[var(--fg)] hover:bg-[var(--ov-05)]">
                I already have an account
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {resumable ? (
              <button
                type="button"
                disabled={phase === 'starting'}
                onClick={() => resume(resumable.id)}
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-4 py-3 text-left text-sm text-[var(--fg)] transition hover:bg-[var(--ready)]/15 disabled:opacity-50"
              >
                <span>Resume your interview in progress</span>
                <ArrowRight className="size-4 text-[var(--ready)]" />
              </button>
            ) : null}
            {reinterviewPageId ? (
              <button
                type="button"
                disabled={phase === 'starting'}
                onClick={() => start({ page_id: reinterviewPageId })}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--inverse-bg)] px-4 py-3 text-sm font-medium text-[var(--inverse-fg)] transition hover:brightness-95 disabled:opacity-40"
              >
                {phase === 'starting' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {phase === 'starting' ? 'Re-reading your listing…' : 'Start the re-interview'}
              </button>
            ) : (
              <>
                <div className="rounded-2xl border border-[var(--bd-15)] bg-[var(--ov-04)] p-2 dark:border-white/12 dark:bg-white/[0.045]">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://yourbusiness.com"
                    className="w-full bg-transparent px-3 py-3 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)]"
                  />
                  <button
                    type="button"
                    disabled={phase === 'starting' || !sourceUrl.trim()}
                    onClick={() => start({ source_url: sourceUrl.trim() })}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--inverse-bg)] px-4 py-3 text-sm font-medium text-[var(--inverse-fg)] transition hover:brightness-95 disabled:opacity-40"
                  >
                    {phase === 'starting' ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />}
                    Start with my site
                  </button>
                </div>
                <button
                  type="button"
                  disabled={phase === 'starting'}
                  onClick={() => start({})}
                  className="w-full rounded-2xl border border-[var(--bd-15)] px-4 py-3 text-sm text-[var(--fg-soft)] transition hover:bg-[var(--ov-05)] disabled:opacity-50 dark:border-white/12 dark:text-white/75 dark:hover:bg-white/5"
                >
                  Start from scratch
                </button>
              </>
            )}
            {setupError ? <p className="text-xs text-red-500">{setupError}</p> : null}
          </div>
        )}

        {onSwitchToForm ? (
          <button type="button" onClick={onSwitchToForm} className="mt-6 text-xs text-[var(--fg-muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline">
            Skip the chat, build with the form
          </button>
        ) : null}
      </section>
    )
  }

  return (
    <div className={className}>
      <AgentChat<IntakeCard>
        config={{
          agentName: 'Nexez intake',
          badge: 'seller agent',
          tagline: 'Interviews the gaps, drafts your listing.',
          welcome: 'Tell me about your business and I will only ask about what is missing.',
          initialMessages,
          placeholder: 'Answer, ask, or say "skip"...',
          footnote: 'Nothing publishes without you. The interview hands off to the builder for review.',
          headerIcon: <MessageCircleQuestion className="size-5 text-[var(--signal)]" />,
          errorFallback: 'The interview hit a snag. Try again.',
          sendTurn: ({ text }) => postTurn({ content: text }),
          cardKey: intakeCardKey,
          renderCard: (card, controller) => (
            <IntakeCardView
              card={card}
              controller={controller}
              onCommit={commit}
              onAnswers={(answers) => postTurn({ answers })}
            />
          ),
        }}
      />
      {onSwitchToForm ? (
        <p className="mt-3 text-center text-xs text-[var(--fg-muted)]">
          Prefer fields?{' '}
          <button type="button" onClick={onSwitchToForm} className="underline underline-offset-4 hover:text-[var(--fg)]">
            Build with the form instead
          </button>
        </p>
      ) : null}
    </div>
  )
}

function intakeCardKey(card: IntakeCard): string {
  switch (card.type) {
    case 'source_ingested':
      return `source-${card.sourceId}`
    case 'gap_batch':
      return `gaps-${card.gaps.map((g) => g.id).join('+')}`
    case 'draft_summary':
      return `summary-${card.readiness}-${card.draft.services.length + card.draft.products.length}`
    case 'handoff':
      return `handoff-${card.via}`
  }
}

// ---------------------------------------------------------------------------
// Cards

function IntakeCardView({
  card,
  controller,
  onCommit,
  onAnswers,
}: {
  card: IntakeCard
  controller: AgentChatController<IntakeCard>
  onCommit: () => Promise<AgentTurnResponse<IntakeCard>>
  onAnswers: (answers: GapAnswer[]) => Promise<AgentTurnResponse<IntakeCard>>
}) {
  if (card.type === 'source_ingested') {
    return (
      <article className="rounded-3xl border border-[var(--bd-10)] bg-[var(--ov-04)] p-4 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--ready)]/15 text-[var(--ready)]">
            <Globe2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-[var(--fg)]">Read {card.label}</h3>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
              {card.offers} offer{card.offers === 1 ? '' : 's'} imported
              {typeof card.confidence === 'number' ? ` · ${Math.round(card.confidence * 100)}% confidence` : ''}
            </p>
          </div>
        </div>
      </article>
    )
  }

  if (card.type === 'gap_batch') {
    return (
      <article className="space-y-3 rounded-3xl border border-[var(--bd-10)] bg-[var(--ov-04)] p-4 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]">
        {card.gaps.map((gap) => (
          <GapRow key={gap.id} gap={gap} controller={controller} onAnswers={onAnswers} />
        ))}
      </article>
    )
  }

  if (card.type === 'draft_summary') {
    const offers = card.draft.services.length + card.draft.products.length
    return (
      <article className="rounded-3xl border border-[var(--ready)]/35 bg-[var(--ready)]/[0.08] p-4 shadow-xl">
        <div className="flex items-center gap-4">
          <ReadinessRing value={card.readiness} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--fg)]">{card.draft.name || 'Your draft'}</h3>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
              {offers} offer{offers === 1 ? '' : 's'} · {card.draft.faqs.length} FAQ{card.draft.faqs.length === 1 ? '' : 's'}
              {card.draft.industry ? ` · ${card.draft.industry}` : ''}
            </p>
            {card.handoffEligible ? (
              <button
                type="button"
                disabled={controller.busy}
                onClick={() => void controller.runAction('Opening the builder...', onCommit)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--inverse-bg)] px-4 py-2 text-xs font-semibold text-[var(--inverse-fg)] transition hover:brightness-95 disabled:opacity-50"
              >
                Review in the builder
                <ArrowRight className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </article>
    )
  }

  // handoff
  return (
    <article className="rounded-3xl border border-[var(--ready)]/35 bg-[var(--ready)]/10 p-4 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--ov-10)] text-[var(--ready)]">
          <CircleCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--fg)]">Your draft is ready</h3>
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">Review everything in the builder. Publishing stays in your hands.</p>
        </div>
        <button
          type="button"
          disabled={controller.busy}
          onClick={() => void controller.runAction('Opening the builder...', onCommit)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--inverse-bg)] px-4 py-2 text-xs font-semibold text-[var(--inverse-fg)] transition hover:brightness-95 disabled:opacity-50"
        >
          Open builder
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </article>
  )
}

/** One gap: the question, why it matters, and tappable quick answers. Chips
 *  post STRUCTURED answers through the reducer. No LLM interpretation needed,
 *  which keeps the interview fully functional in deterministic mode. */
function GapRow({
  gap,
  controller,
  onAnswers,
}: {
  gap: Gap
  controller: AgentChatController<IntakeCard>
  onAnswers: (answers: GapAnswer[]) => Promise<AgentTurnResponse<IntakeCard>>
}) {
  const quickAnswers = gapQuickAnswers(gap)
  return (
    <div>
      <div className="flex items-start gap-2">
        {gap.kind === 'blocking' ? (
          <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-[var(--amber)]" title="Needed before your listing can go live" />
        ) : (
          <ListChecks className="mt-0.5 size-3.5 shrink-0 text-[var(--fg-muted)]" />
        )}
        <div className="min-w-0">
          <p className="text-sm leading-5 text-[var(--fg)]">{gap.question}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--fg-muted)]">{gap.why}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-3.5">
        {quickAnswers.map((qa) => (
          <button
            key={qa.label}
            type="button"
            disabled={controller.busy}
            onClick={() => void controller.runAction('Recording...', () => onAnswers([qa.answer]))}
            className="rounded-full border border-[var(--bd-15)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--fg-soft)] transition hover:border-[var(--signal)]/40 hover:text-[var(--signal)] disabled:opacity-40 dark:border-white/12 dark:bg-white/[0.04] dark:text-white/70"
          >
            {qa.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Enumerable quick answers per gap; everything gets Skip. */
function gapQuickAnswers(gap: Gap): Array<{ label: string; answer: GapAnswer }> {
  const answers: Array<{ label: string; answer: GapAnswer }> = []
  if (gap.field === 'offerType' && gap.offerKey) {
    answers.push(
      {
        label: 'Fixed price',
        answer: { gapId: gap.id, answer: 'Fixed price', fields: [{ target: 'offer', offerKey: gap.offerKey, field: 'offerType', value: 'fixed' }] },
      },
      {
        label: 'Open to offers',
        answer: { gapId: gap.id, answer: 'Open to offers', fields: [{ target: 'offer', offerKey: gap.offerKey, field: 'offerType', value: 'negotiable' }] },
      },
    )
  }
  answers.push({ label: 'Skip', answer: { gapId: gap.id, answer: 'skip', skipped: true } })
  return answers
}

function ReadinessRing({ value }: { value: number }) {
  const radius = 24
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(100, value)) / 100
  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`Readiness ${value}%`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--bd-15)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="var(--ready)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${circumference * filled} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[var(--fg)]">{value}</span>
    </div>
  )
}

export { IntakeCardView }
