'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  FileClock,
  RefreshCw,
  Scale,
} from 'lucide-react'
import {
  decideTemplateReviewAction,
  openTemplateReviewAction,
  type TemplateReviewActionState,
} from '../../app/admin/templates/actions'
import type {
  CommerceTemplateReviewDecision,
  CommerceTemplateReviewReason,
} from '../../lib/commerce-template-reviews'

const INITIAL_STATE: TemplateReviewActionState = { ok: false, message: '' }

export type CommerceTemplateReviewDeskItem = {
  templateId: string
  templateVersion: number
  title: string
  recommendationLabel: string
  performanceReviewReady: boolean
  openToken: string
  decisionToken: string
  activeReview: {
    reviewId: string
    reason: CommerceTemplateReviewReason
    reasonLabel: string
    rationale: string
    openedAt: string
    evidenceGeneratedAt: string
    evidenceActionLabel: string
    performanceReviewReady: boolean
    missingSources: string[]
    checkoutValue: string
    negotiatedValue: string
  } | null
  history: Array<{
    reviewId: string
    reasonLabel: string
    decision: CommerceTemplateReviewDecision
    decisionLabel: string
    rationale: string
    decidedAt: string
  }>
}

export function CommerceTemplateReviewDesk({
  available,
  truncated,
  items,
}: {
  available: boolean
  truncated: boolean
  items: CommerceTemplateReviewDeskItem[]
}) {
  return (
    <section className="mt-8 border-t border-border pt-7" aria-labelledby="template-review-desk-heading">
      <div className="flex max-w-3xl gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white/[0.04]">
          <BookOpenCheck className="size-4 text-[var(--signal)]" />
        </div>
        <div>
          <h2 id="template-review-desk-heading" className="text-xl font-semibold tracking-tight">Guide review desk</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
            Preserve the evidence behind a human keep, revise, or retirement recommendation. Decisions here do not edit a guide or merchant listing.
          </p>
        </div>
      </div>

      {!available ? (
        <section className="mt-5 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/8 px-5 py-8 text-center">
          <AlertTriangle className="mx-auto size-6 text-[var(--amber)]" />
          <h3 className="mt-3 text-base font-semibold">Guide review history is unavailable</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--fg-muted)]">
            The private review ledger could not be read. Refresh before opening or deciding a review.
          </p>
        </section>
      ) : (
        <>
          {truncated ? (
            <div className="mt-5 flex gap-3 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--amber)]" />
              <p className="text-xs leading-5 text-[var(--fg-muted)]">The review history limit was reached. New work is available, but older decisions are not shown here.</p>
            </div>
          ) : null}
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {items.map((item) => <GuideReviewCard key={`${item.templateId}@${item.templateVersion}`} item={item} />)}
          </div>
        </>
      )}
    </section>
  )
}

function GuideReviewCard({ item }: { item: CommerceTemplateReviewDeskItem }) {
  return (
    <article
      id={templateReviewAnchor(item.templateId, item.templateVersion)}
      className="scroll-mt-24 overflow-hidden rounded-lg border border-border bg-white/[0.025]"
    >
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{item.title}</h3>
            <p className="mt-1 truncate font-mono text-[11px] text-[var(--fg-muted-2)]">{item.templateId}@{item.templateVersion}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-medium ${item.activeReview
            ? 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'
            : 'border-border bg-white/[0.035] text-[var(--fg-soft)]'
          }`}>
            {item.activeReview ? <FileClock className="size-3" /> : <CircleDashed className="size-3" />}
            {item.activeReview ? 'Review open' : 'No open review'}
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">Current next move: {item.recommendationLabel}</p>
      </header>

      <div className="px-4 py-4 sm:px-5">
        {item.activeReview ? (
          <ActiveReview review={item.activeReview} initialToken={item.decisionToken} />
        ) : (
          <OpenReviewForm item={item} initialToken={item.openToken} />
        )}
        <ReviewHistory history={item.history} />
      </div>
    </article>
  )
}

function ActiveReview({
  review,
  initialToken,
}: {
  review: NonNullable<CommerceTemplateReviewDeskItem['activeReview']>
  initialToken: string
}) {
  return (
    <>
      <div className="rounded-md border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--amber)]">{review.reasonLabel}</span>
          <span className="text-[10px] text-[var(--fg-muted-2)]">Opened {formatUtc(review.openedAt)}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--fg-soft)]">{review.rationale}</p>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <Evidence label="Evidence at opening" value={review.evidenceActionLabel} />
        <Evidence
          label="Evidence status"
          value={review.performanceReviewReady ? 'Results-review floor met' : 'Manual review'}
        />
        <Evidence label="Live checkout" value={review.checkoutValue} />
        <Evidence label="Negotiated commerce" value={review.negotiatedValue} />
      </dl>
      {review.missingSources.length ? (
        <p className="mt-3 text-[11px] leading-5 text-[var(--amber)]">
          Unavailable at opening: {review.missingSources.join(', ')}. Those sources were not treated as zero.
        </p>
      ) : null}
      <p className="mt-3 text-[10px] text-[var(--fg-muted-2)]">Evidence captured {formatUtc(review.evidenceGeneratedAt)}</p>
      <DecisionForm reviewId={review.reviewId} initialToken={initialToken} />
    </>
  )
}

function OpenReviewForm({
  item,
  initialToken,
}: {
  item: CommerceTemplateReviewDeskItem
  initialToken: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [idempotencyToken, setIdempotencyToken] = useState(initialToken)
  const [state, formAction, pending] = useActionState(openTemplateReviewAction, INITIAL_STATE)

  useEffect(() => {
    if (!state.ok || state.completedToken !== idempotencyToken) return
    formRef.current?.reset()
    setIdempotencyToken(crypto.randomUUID())
  }, [idempotencyToken, state.completedToken, state.ok])

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="templateId" value={item.templateId} />
      <input type="hidden" name="templateVersion" value={item.templateVersion} />
      <input type="hidden" name="idempotencyToken" value={idempotencyToken} />
      <label className="block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Why review this guide?</span>
        <select
          name="reviewReason"
          defaultValue={item.performanceReviewReady ? 'performance' : 'manual'}
          className="mt-2 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-[var(--signal)]"
        >
          <option value="performance" disabled={!item.performanceReviewReady}>Results need review{item.performanceReviewReady ? '' : ' (evidence floor not met)'}</option>
          <option value="catalog_overlap">Guide overlap</option>
          <option value="replacement">Possible replacement</option>
          <option value="manual">Operator review</option>
        </select>
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Opening note</span>
        <textarea
          name="rationale"
          rows={3}
          minLength={10}
          maxLength={2_000}
          required
          placeholder="Explain what should be reviewed and why."
          className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]"
        />
      </label>
      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--signal)] px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
      >
        <BookOpenCheck className="size-4" /> {pending ? 'Opening review...' : 'Open review'}
      </button>
      {!item.performanceReviewReady ? (
        <p className="mt-3 text-[11px] leading-5 text-[var(--fg-muted-2)]">
          A manual review is allowed, but it will remain distinct from a results review until the evidence floor is met.
        </p>
      ) : null}
    </form>
  )
}

function DecisionForm({ reviewId, initialToken }: { reviewId: string; initialToken: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [idempotencyToken, setIdempotencyToken] = useState(initialToken)
  const [state, formAction, pending] = useActionState(decideTemplateReviewAction, INITIAL_STATE)

  useEffect(() => {
    if (!state.ok || state.completedToken !== idempotencyToken) return
    formRef.current?.reset()
    setIdempotencyToken(crypto.randomUUID())
  }, [idempotencyToken, state.completedToken, state.ok])

  return (
    <form ref={formRef} action={formAction} className="mt-4 border-t border-border pt-4">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="idempotencyToken" value={idempotencyToken} />
      <label className="block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Decision note</span>
        <textarea
          name="rationale"
          rows={3}
          minLength={10}
          maxLength={2_000}
          required
          placeholder="Explain the decision and the code change, if any, that should follow."
          className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]"
        />
      </label>
      <ActionMessage state={state} />
      <div className="mt-3 flex flex-wrap gap-2">
        <DecisionButton value="keep" label="Keep guide" pending={pending} icon={CheckCircle2} />
        <DecisionButton value="revise" label="Revise guide" pending={pending} icon={RefreshCw} />
        <DecisionButton value="recommend_retirement" label="Recommend retirement" pending={pending} icon={Scale} />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[var(--fg-muted-2)]">A decision closes this review. It does not change the guide registry.</p>
    </form>
  )
}

function DecisionButton({
  value,
  label,
  pending,
  icon: Icon,
}: {
  value: CommerceTemplateReviewDecision
  label: string
  pending: boolean
  icon: typeof CheckCircle2
}) {
  return (
    <button
      type="submit"
      name="decision"
      value={value}
      disabled={pending}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-white/[0.035] px-3 text-xs font-semibold text-[var(--fg-soft)] transition hover:bg-white/[0.07] hover:text-foreground disabled:cursor-wait disabled:opacity-50"
    >
      <Icon className="size-3.5" /> {pending ? 'Recording...' : label}
    </button>
  )
}

function ReviewHistory({ history }: { history: CommerceTemplateReviewDeskItem['history'] }) {
  if (!history.length) return null
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Recent guide review decisions">
      <h4 className="text-xs font-semibold">Recent decisions</h4>
      <ol className="mt-3 space-y-2">
        {history.map((item) => (
          <li key={item.reviewId} className="rounded-md border border-border bg-black/15 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">{item.decisionLabel}</span>
              <span className="text-[10px] text-[var(--fg-muted-2)]">{formatUtc(item.decidedAt)}</span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--fg-muted-2)]">{item.reasonLabel}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">{item.rationale}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/15 px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">{label}</dt>
      <dd className="mt-1 text-xs font-medium text-[var(--fg-soft)]">{value}</dd>
    </div>
  )
}

function ActionMessage({ state }: { state: TemplateReviewActionState }) {
  return state.message ? (
    <p className={`mt-3 text-xs ${state.ok ? 'text-[var(--ready)]' : 'text-red-300'}`} role="status">
      {state.message}
    </p>
  ) : null
}

function templateReviewAnchor(templateId: string, templateVersion: number): string {
  return `review-${templateId.replace(/[^a-z0-9]+/g, '-')}-${templateVersion}`
}

function formatUtc(value: string): string {
  return `${new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })} UTC`
}
