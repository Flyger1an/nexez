import { AlertTriangle } from 'lucide-react'

export function DataLoadNotice({ issues }: { issues: string[] }) {
  if (!issues.length) return null
  const unique = [...new Set(issues)]

  return (
    <section
      role="status"
      className="mt-5 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-4 py-3 text-sm text-zinc-200"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--amber)]" aria-hidden />
        <div>
          <p className="font-medium text-white">Some information is temporarily unavailable</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Some totals may be incomplete. Nexez could not load: {unique.join(', ')}. Refresh before making a financial decision or updating an order.
          </p>
        </div>
      </div>
    </section>
  )
}
