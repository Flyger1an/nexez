import { getTrustScore } from '../../lib/agent-page'
import { PageEditor } from './usePageEditor'

export function ReadinessAside({ e }: { e: PageEditor }) {
  const page = e.page as any
  return (
    <aside>
      <div className="flex items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Edit agent page</h1>
        {page?.versions?.length > 0 && (
          <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-400">
            {page.versions.length} versions
          </span>
        )}
        <span className="rounded-full border border-amber-300/30 bg-amber-400/5 px-2.5 py-0.5 text-xs text-amber-200">
          Trust {getTrustScore(page, e.trustEvents)}/100
        </span>
      </div>
      <p className="mt-4 text-zinc-400">
        Tighten the facts an AI buyer needs. The readiness score updates as you fill in the page.
      </p>
      <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-500">AI readiness</p>
        <p className="mt-2 text-4xl font-semibold">{e.score}%</p>
        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${e.score}%` }} />
        </div>
      </div>
    </aside>
  )
}
