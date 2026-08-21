import { Radar } from 'lucide-react'
import type { CommerceDemandSnapshot } from '../../lib/commerce-demand'
import {
  buildCommerceSupplyPriorities,
  type CommerceSupplyPriority,
} from '../../lib/commerce-supply-priority'

export function CommerceDemandPanel({ snapshot }: { snapshot: CommerceDemandSnapshot }) {
  const priorities = buildCommerceSupplyPriorities(snapshot)

  return (
    <section className="border-t border-border py-8" aria-labelledby="commerce-demand-heading">
      <div className="flex items-start gap-3">
        <Radar className="mt-0.5 size-5 shrink-0 text-[var(--signal)]" />
        <div>
          <h2 id="commerce-demand-heading" className="text-lg font-semibold">Commerce demand signals</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            Directional simulator interactions from the last 30 days. These signals help prioritize marketplace recruitment and Commerce Library coverage; they are not conversion evidence.
          </p>
        </div>
      </div>

      {!snapshot.available ? (
        <div className="mt-5 rounded-lg border border-border bg-white/[0.025] px-5 py-6 text-sm text-[var(--fg-muted)]">
          Commerce demand telemetry is unavailable. The public simulator continues to operate without it.
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <DemandMetric label="Observed" value={snapshot.totalSignals} />
            <DemandMetric label="Live" value={snapshot.liveMatches} />
            <DemandMetric label="Related" value={snapshot.relatedMatches} />
            <DemandMetric label="Reference only" value={snapshot.referenceMatches} />
            <DemandMetric label="Unmapped gaps" value={snapshot.coverageGaps} />
          </div>

          {snapshot.truncated ? (
            <p className="mt-3 text-xs leading-5 text-[var(--amber)]">
              Showing the newest 5,000 signals in this window; totals are a lower bound.
            </p>
          ) : null}

          <SupplyPriorities priorities={priorities} coverageGaps={snapshot.coverageGaps} />

          {snapshot.categories.length ? (
            <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-white/[0.025]">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-[0.08em] text-[var(--fg-muted-2)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Canonical category</th>
                    <th className="px-4 py-3 font-medium">Observed</th>
                    <th className="px-4 py-3 font-medium">Live</th>
                    <th className="px-4 py-3 font-medium">Related</th>
                    <th className="px-4 py-3 font-medium">Reference only</th>
                    <th className="px-4 py-3 font-medium">Unresolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {snapshot.categories.slice(0, 12).map((category) => (
                    <tr key={category.referenceId}>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-foreground">{category.title}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-[var(--fg-muted-2)]">
                          {category.domain}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{category.observed}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--ready)]">{category.live}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--amber)]">{category.related}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--amber)]">{category.reference}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-foreground">{category.unresolved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-border bg-white/[0.025] px-5 py-6 text-sm text-[var(--fg-muted)]">
              No canonical Commerce category has received a simulator signal in this window yet.
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-xs leading-5 text-[var(--fg-muted-2)]">
        No raw buyer queries, request labels, merchants, locations, users, sessions, IP addresses, or user-agent strings are stored. Unmapped requests contribute only to the aggregate gap count.
      </p>
    </section>
  )
}

function SupplyPriorities({
  priorities,
  coverageGaps,
}: {
  priorities: CommerceSupplyPriority[]
  coverageGaps: number
}) {
  return (
    <section className="mt-6" aria-labelledby="supply-priorities-heading">
      <h3 id="supply-priorities-heading" className="text-sm font-semibold text-foreground">
        Supply acquisition priorities
      </h3>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--fg-muted)]">
        Ranked by unresolved mapped interactions. Every recommendation names the evidence and next operator move; it is not a conversion score.
      </p>

      {priorities.length ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {priorities.slice(0, 6).map((priority) => (
            <article
              key={priority.referenceId}
              className="rounded-lg border border-border bg-white/[0.025] p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.08em]">
                <span className="font-mono text-[var(--signal)]">Priority {priority.rank}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[var(--fg-muted)]">
                  {priority.lifecycleLabel}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="font-medium text-foreground">{priority.title}</h4>
                  <p className="mt-1 font-mono text-[10px] text-[var(--fg-muted-2)]">
                    {priority.domain}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-[var(--amber)]">
                  {priority.actionLabel}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">{priority.rationale}</p>
              <p className="mt-3 text-xs tabular-nums text-[var(--fg-muted-2)]">
                {priority.unresolved} unresolved · {priority.reference} reference only · {priority.related} related · {priority.live} live
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-white/[0.025] px-5 py-4 text-sm text-[var(--fg-muted)]">
          No mapped category currently has unresolved simulator demand.
        </div>
      )}

      {priorities.length > 6 ? (
        <p className="mt-2 text-xs text-[var(--fg-muted-2)]">
          Showing the top 6 of {priorities.length} mapped priorities.
        </p>
      ) : null}

      {coverageGaps > 0 ? (
        <p className="mt-3 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-4 py-3 text-xs leading-5 text-[var(--fg-muted)]">
          {coverageGaps} unmapped {coverageGaps === 1 ? 'request remains' : 'requests remain'} aggregate-only. Nexez does not assign those requests to an acquisition category without a privacy-safe canonical classification.
        </p>
      ) : null}
    </section>
  )
}

function DemandMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-white/[0.025] px-4 py-3">
      <p className="text-xs text-[var(--fg-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
