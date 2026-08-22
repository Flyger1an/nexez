'use client'

import { useMemo, useState } from 'react'
import { History, Loader2, Minus, TrendingDown, TrendingUp, Trash2 } from 'lucide-react'
import {
  buildResearchTrendIndex,
  researchRunScore,
  summarizeResearchRuns,
} from '../../lib/agent-operations'
import type { AgentLabResearchRun } from '../../lib/agent-lab-research'

export function ResearchArchive({
  title,
  description,
  empty,
  runs,
  loading,
  locked = false,
  variant = 'compact',
  itemName,
  onLoad,
  onRemove,
}: {
  title: string
  description: string
  empty: string
  runs: AgentLabResearchRun[]
  loading: boolean
  locked?: boolean
  variant?: 'compact' | 'grid'
  itemName: 'scan' | 'report'
  onLoad: (run: AgentLabResearchRun) => void
  onRemove: (id: string) => Promise<boolean>
}) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const trends = useMemo(() => buildResearchTrendIndex(runs), [runs])
  const summary = useMemo(() => summarizeResearchRuns(runs), [runs])

  return (
    <aside className="card min-w-0" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium"><History className="size-4 shrink-0 text-[var(--signal)]" /> {title}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
        </div>
        {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-zinc-500" /> : <span className="text-xs tabular-nums text-zinc-500">{runs.length}</span>}
      </div>

      {!locked && runs.length ? (
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Research trend summary">
          <ArchiveStat label="Targets" value={String(summary.uniqueTargets)} />
          <ArchiveStat label="With trend" value={String(summary.trackedTargets)} />
          <ArchiveStat
            label="Movement"
            value={formatMovement(summary.risingTargets, summary.fallingTargets, summary.stableTargets)}
            tone={summary.risingTargets ? 'rise' : summary.fallingTargets ? 'fall' : undefined}
          />
        </div>
      ) : null}

      {locked ? (
        <p className="mt-5 rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">Sign in to save, compare, and replay private research.</p>
      ) : runs.length ? (
        <div className={`mt-4 gap-2 ${variant === 'grid' ? 'grid sm:grid-cols-2 xl:grid-cols-3' : 'max-h-72 space-y-2 overflow-y-auto pr-1'}`}>
          {runs.slice(0, variant === 'grid' ? 12 : runs.length).map((run) => {
            const score = researchRunScore(run)
            const trend = trends.get(run.id)
            return (
              <article key={run.id} className="min-w-0 rounded-xl border border-white/10 bg-[#12101B] p-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <button onClick={() => onLoad(run)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]">
                    <span className="block truncate text-sm font-medium text-zinc-200">{run.targetHost}</span>
                    <span className="mt-1 block text-[11px] text-zinc-500">{formatResearchDate(run.createdAt)}</span>
                    {run.comparedPageSlug ? <span className="mt-1 block truncate text-[10px] text-[var(--signal)]">vs /{run.comparedPageSlug}</span> : null}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {score != null ? <span className="rounded-md border border-white/10 px-1.5 py-1 text-[11px] font-medium tabular-nums text-zinc-300">{score}</span> : null}
                    <button
                      onClick={() => setConfirmRemoveId(run.id)}
                      aria-label={`Remove saved ${itemName} for ${run.targetHost}`}
                      className="rounded-lg p-2 text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {trend ? <TrendLabel delta={trend.delta} /> : <p className="mt-2 text-[10px] text-zinc-600">Baseline snapshot</p>}

                {confirmRemoveId === run.id ? (
                  <div role="group" aria-label={`Confirm removal for ${run.targetHost}`} className="mt-2 flex items-center gap-2">
                    <button onClick={() => setConfirmRemoveId(null)} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200">Keep</button>
                    <button
                      onClick={async () => { if (await onRemove(run.id)) setConfirmRemoveId(null) }}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/15"
                    >
                      Remove {itemName}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => onLoad(run)} className="mt-2 text-xs font-medium text-[var(--signal)] hover:underline">Open {itemName}</button>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-zinc-500">{empty}</p>
      )}
    </aside>
  )
}

function ArchiveStat({ label, value, tone }: { label: string; value: string; tone?: 'rise' | 'fall' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2 text-center">
      <p className="text-[9px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone === 'rise' ? 'text-[var(--signal)]' : tone === 'fall' ? 'text-[var(--amber)]' : 'text-zinc-300'}`}>{value}</p>
    </div>
  )
}

function TrendLabel({ delta }: { delta: number }) {
  if (delta > 0) return <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--signal)]"><TrendingUp className="size-3" /> +{delta} score since prior snapshot</p>
  if (delta < 0) return <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--amber)]"><TrendingDown className="size-3" /> {delta} score since prior snapshot</p>
  return <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500"><Minus className="size-3" /> No score movement</p>
}

function formatResearchDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function formatMovement(rising: number, falling: number, stable: number) {
  const parts = [rising ? `↑${rising}` : '', falling ? `↓${falling}` : '', stable ? `=${stable}` : ''].filter(Boolean)
  return parts.join(' ') || '—'
}
