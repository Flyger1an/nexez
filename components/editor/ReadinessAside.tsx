import { getTrustScore } from '../../lib/agent-page'
import { PageEditor } from './usePageEditor'

export function ReadinessAside({ e }: { e: PageEditor }) {
  const page = e.page as any
  return (
    <aside className="min-w-0">
      <div className="flex items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Edit listing</h1>
        {page?.versions?.length > 0 && (
          <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs text-[var(--fg-muted)]">
            {page.versions.length} versions
          </span>
        )}
        <span className="rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/5 px-2.5 py-0.5 text-xs text-[var(--amber)]">
          Trust {getTrustScore(page, e.trustEvents)}/100
        </span>
      </div>
      <p className="mt-4 text-[var(--fg-muted)]">
        Tighten the facts an AI buyer needs. The readiness score updates as you fill in the listing.
      </p>
      <div className="mt-6 rounded-lg border border-[var(--bd-10)] bg-[var(--ov-04)] p-5">
        <p className="text-sm text-[var(--fg-muted-2)]">AI readiness</p>
        <p className="mt-2 text-4xl font-semibold">{e.score}%</p>
        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[var(--signal)]" style={{ width: `${e.score}%` }} />
        </div>
      </div>
    </aside>
  )
}
