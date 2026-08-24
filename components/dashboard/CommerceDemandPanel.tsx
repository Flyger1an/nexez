import { Radar } from 'lucide-react'
import type { CommerceDemandSnapshot } from '../../lib/commerce-demand'
import type { CommerceSupplyWorkflowSnapshot } from '../../lib/commerce-supply-workflow'
import { CommerceSupplyWorkflowPanel } from './CommerceSupplyWorkflowPanel'

export function CommerceDemandPanel({
  snapshot,
  supplyWorkflow,
}: {
  snapshot: CommerceDemandSnapshot
  supplyWorkflow: CommerceSupplyWorkflowSnapshot
}) {
  return (
    <section className="border-t border-border py-8" aria-labelledby="commerce-demand-heading">
      <div className="flex items-start gap-3">
        <Radar className="mt-0.5 size-5 shrink-0 text-[var(--signal)]" />
        <div>
          <h2 id="commerce-demand-heading" className="text-lg font-semibold">What customers are looking for</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            See which services people searched for in the simulator over the last 30 days. Use these trends to decide which sellers and services to add next. They do not represent completed sales.
          </p>
        </div>
      </div>

      {!snapshot.available ? (
        <div className="mt-5 rounded-lg border border-border bg-white/[0.025] px-5 py-6 text-sm text-[var(--fg-muted)]">
          Search activity is temporarily unavailable. The public simulator is still working.
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <DemandMetric label="Total searches" value={snapshot.totalSignals} />
            <DemandMetric label="Seller match" value={snapshot.liveMatches} />
            <DemandMetric label="Related seller" value={snapshot.relatedMatches} />
            <DemandMetric label="Guide only" value={snapshot.referenceMatches} />
            <DemandMetric label="Not covered" value={snapshot.coverageGaps} />
          </div>

          {snapshot.truncated ? (
            <p className="mt-3 text-xs leading-5 text-[var(--amber)]">
              Showing the newest 5,000 searches. Actual totals may be higher.
            </p>
          ) : null}

          <CommerceSupplyWorkflowPanel
            initialSnapshot={supplyWorkflow}
            coverageGaps={snapshot.coverageGaps}
          />

          {snapshot.categories.length ? (
            <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-white/[0.025]">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-[0.08em] text-[var(--fg-muted-2)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Service category</th>
                    <th className="px-4 py-3 font-medium">Searches</th>
                    <th className="px-4 py-3 font-medium">Seller match</th>
                    <th className="px-4 py-3 font-medium">Related seller</th>
                    <th className="px-4 py-3 font-medium">Guide only</th>
                    <th className="px-4 py-3 font-medium">Not covered</th>
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
              No service category has received a simulator search in this period yet.
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-xs leading-5 text-[var(--fg-muted-2)]">
        This report stores totals only. Nexez does not store the words people searched, their identity, location, session, IP address, or device details.
      </p>
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
