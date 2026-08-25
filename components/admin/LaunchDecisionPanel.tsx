'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CirclePause, GitCommitHorizontal, ShieldCheck } from 'lucide-react'
import {
  recordLaunchDecisionAction,
  type LaunchDecisionActionState,
} from '../../app/admin/launch/actions'

const INITIAL_STATE: LaunchDecisionActionState = { ok: false, message: '' }

type LaunchDecisionHistoryItem = {
  id: string
  decision: 'go' | 'hold'
  reason: string
  operatorEmail: string
  productionRevision: string | null
  createdAt: string
}

export function LaunchDecisionPanel({
  goEligible,
  productionRevision,
  certificateStatus,
  blockers,
  decisions,
  initialToken,
  snapshotGeneratedAt,
  launchScore,
  incidentCount,
}: {
  goEligible: boolean
  productionRevision: string | null
  certificateStatus: 'Passed' | 'Not passed' | 'Unavailable'
  blockers: Array<{ id: string; label: string }>
  decisions: LaunchDecisionHistoryItem[]
  initialToken: string
  snapshotGeneratedAt: string
  launchScore: number
  incidentCount: number
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [idempotencyToken, setIdempotencyToken] = useState(initialToken)
  const [state, formAction, pending] = useActionState(recordLaunchDecisionAction, INITIAL_STATE)

  useEffect(() => {
    if (!state.ok || state.completedToken !== idempotencyToken) return
    formRef.current?.reset()
    setIdempotencyToken(crypto.randomUUID())
  }, [idempotencyToken, state.completedToken, state.ok])

  return (
    <section className="border-t border-border py-8" aria-labelledby="launch-decision-heading">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div>
          <div className="mb-5 flex max-w-3xl gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white/[0.04]">
              <ShieldCheck className="size-4 text-[var(--fg-muted)]" />
            </div>
            <div>
              <h2 id="launch-decision-heading" className="text-lg font-semibold tracking-tight">Launch decision</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
                Record the human go or hold call against the evidence shown right now.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white/[0.03] p-4 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${goEligible
                  ? 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]'
                  : 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'
                }`}>
                  {goEligible ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                  {goEligible ? 'Eligible to record go' : 'Hold recommended'}
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">
                  This saves an audit record. It does not deploy, roll back, change supply, or charge anyone.
                </p>
              </div>
              <code className="font-mono text-xs text-[var(--fg-muted)]">
                {productionRevision?.slice(0, 12) ?? 'revision unavailable'}
              </code>
            </div>

            <dl className="mt-4 grid gap-3 border-y border-border py-4 sm:grid-cols-3">
              <EvidenceItem label="Readiness" value={`${launchScore}%`} />
              <EvidenceItem label="Exact certificate" value={certificateStatus} />
              <EvidenceItem label="Active incidents" value={String(incidentCount)} />
            </dl>

            {blockers.length ? (
              <div className="mt-4 rounded-md border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] p-3">
                <p className="text-xs font-medium text-[var(--amber)]">Clear before recording go</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--fg-muted)]">
                  {blockers.map((blocker) => (
                    <li key={blocker.id}>• {blocker.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form ref={formRef} action={formAction} className="mt-4">
              <input type="hidden" name="idempotencyToken" value={idempotencyToken} />
              <label className="block">
                <span className="text-xs font-medium text-[var(--fg-muted)]">Decision note</span>
                <textarea
                  name="reason"
                  rows={3}
                  minLength={3}
                  maxLength={1_000}
                  required
                  placeholder="Record why this is the right call for this launch window."
                  className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]"
                />
              </label>
              {state.message ? (
                <p className={`mt-3 text-xs ${state.ok ? 'text-[var(--ready)]' : 'text-red-300'}`} role="status">
                  {state.message}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="hold"
                  disabled={pending}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--amber)]/35 bg-[var(--amber)]/10 px-4 text-sm font-semibold text-[var(--amber)] transition hover:bg-[var(--amber)]/15 disabled:cursor-wait disabled:opacity-60"
                >
                  <CirclePause className="size-4" /> {pending ? 'Recording...' : 'Record hold'}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="go"
                  disabled={pending || !goEligible}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--ready)] px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCircle2 className="size-4" /> {pending ? 'Recording...' : 'Record go'}
                </button>
              </div>
            </form>

            <p className="mt-4 text-[11px] leading-5 text-[var(--fg-muted-2)]">
              Evidence refreshed {formatUtc(snapshotGeneratedAt)}. Refresh the page before every decision.
            </p>
          </div>
        </div>

        <div>
          <div className="mb-5 flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white/[0.04]">
              <GitCommitHorizontal className="size-4 text-[var(--fg-muted)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Decision history</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">New decisions are added. Earlier calls cannot be edited.</p>
            </div>
          </div>
          {decisions.length ? (
            <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white/[0.025] backdrop-blur-xl">
              {decisions.map((decision) => (
                <li key={decision.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium ${decision.decision === 'go'
                      ? 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]'
                      : 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'
                    }`}>
                      {decision.decision === 'go' ? <CheckCircle2 className="size-3" /> : <CirclePause className="size-3" />}
                      {decision.decision === 'go' ? 'Go' : 'Hold'}
                    </span>
                    <span className="text-[11px] text-[var(--fg-muted-2)]">{formatUtc(decision.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--fg-soft)]">{decision.reason}</p>
                  <p className="mt-2 truncate font-mono text-[10px] text-[var(--fg-muted-2)]">
                    {decision.productionRevision?.slice(0, 12) ?? 'revision unavailable'} · {decision.operatorEmail}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex min-h-36 items-center gap-4 rounded-lg border border-border bg-white/[0.025] px-5 backdrop-blur-xl">
              <CirclePause className="size-5 shrink-0 text-[var(--fg-muted)]" />
              <div>
                <p className="text-sm font-medium">No launch decision recorded</p>
                <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">The first go or hold call will establish the operator baseline.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function EvidenceItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

function formatUtc(value: string) {
  return `${new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })} UTC`
}
