import { Gauge } from 'lucide-react'
import { getTrustScore } from '../../lib/agent-page'
import { PageEditor } from './usePageEditor'

export function ReadinessAside({ e }: { e: PageEditor }) {
  const page = e.page as any
  return (
    <aside className="mt-4 min-w-0 rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--glass)] p-4 shadow-[var(--settings-panel-shadow)] backdrop-blur-[var(--blur-card)]">
      <div className="flex items-center gap-2">
        <Gauge className="size-4 text-[var(--settings-emphasis)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--fg)]">AI readiness</h2>
      </div>
      <div className="mt-3">
        <p className="mt-2 text-4xl font-semibold">{e.score}%</p>
        <div className="mt-3 h-2 rounded-full bg-[var(--fill-2)]">
          <div className="h-full rounded-full bg-[var(--settings-emphasis)]" style={{ width: `${e.score}%` }} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {page?.versions?.length > 0 ? (
          <span className="rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--fill-1)] px-2.5 py-1 text-[var(--fg-muted)]">
            {page.versions.length} versions
          </span>
        ) : null}
        <span className="rounded-[var(--r-pill)] border border-[var(--amber)]/30 bg-[var(--amber)]/5 px-2.5 py-1 text-[var(--amber)]">
          Trust {getTrustScore(page, e.trustEvents)}/100
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">Updates as you strengthen the listing.</p>
    </aside>
  )
}
