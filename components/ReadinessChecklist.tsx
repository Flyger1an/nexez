'use client'

import { CheckCircle2, Circle } from 'lucide-react'
import type { ReadinessCriterion } from '../lib/agent-page'

/**
 * "What's still missing" checklist for the /create flow. Derives entirely from
 * `getReadinessCriteria` so it stays in lockstep with the readiness % shown
 * alongside it. Met items collapse to a quiet done-row; unmet items surface a hint.
 */
export function ReadinessChecklist({ criteria, score }: { criteria: ReadinessCriterion[]; score: number }) {
  const missing = criteria.filter((c) => !c.met)
  const metCount = criteria.length - missing.length
  const allMet = missing.length === 0

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          {allMet ? (
            <>
              <CheckCircle2 className="nx-celebrate-pop size-4 text-[var(--ready)]" aria-hidden />
              Agent-ready 🎉
            </>
          ) : (
            "What's still missing"
          )}
        </p>
        <p className={`text-sm font-semibold ${allMet ? 'text-[var(--ready)]' : 'text-[var(--signal)]'}`}>{score}%</p>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: allMet ? 'linear-gradient(90deg, var(--signal), var(--ready))' : 'var(--ready)' }}
        />
      </div>

      <ul className="space-y-1.5">
        {criteria.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5">
            {c.met ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-zinc-600" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={c.met ? 'text-sm text-zinc-500' : 'text-sm font-medium text-zinc-100'}>{c.label}</p>
              {!c.met ? <p className="text-xs text-zinc-500">{c.hint}</p> : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-zinc-500">
        {allMet
          ? 'Every required check passes. The certified claim remains live while the listing stays complete and published.'
          : `${metCount} of ${criteria.length} checks pass. Complete the rest to earn the Certified Agent-Ready badge.`}
      </p>
    </div>
  )
}
