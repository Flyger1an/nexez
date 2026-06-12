'use client'

import { Activity, BarChart3, Bot, Copy, CopyPlus, ExternalLink, Gauge, Pencil, Play, Settings, Trash2 } from 'lucide-react'
import { AgentPage, getOfferCount, getReadinessScore } from '../../lib/agent-page'
import { agentRuntimeUrl } from '../../lib/site'

export const pageActionClass =
  'inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white'

export function PageCard({
  page,
  eventCount,
  onCopy,
  onDelete,
  onDuplicate,
  onToggle,
  selected,
  onSelectToggle,
}: {
  page: AgentPage
  eventCount: number
  onCopy: () => void
  onDelete: () => void
  onDuplicate: () => void
  onToggle: () => void
  selected?: boolean
  onSelectToggle?: () => void
}) {
  const score = getReadinessScore(page)

  return (
    <article className={`card overflow-hidden p-0 ${selected ? 'ring-2 ring-[var(--signal)]/60' : ''}`}>
      <div className="flex items-start justify-between border-b border-white/10 p-5">
        <div className="flex items-center gap-2">
          {onSelectToggle && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onSelectToggle}
              className="size-4 accent-[var(--signal)]"
              aria-label="Select page for bulk actions"
            />
          )}
          <div className="flex size-10 items-center justify-center rounded-2xl bg-white/5">
            <Bot className="size-5 text-[var(--signal)]" />
          </div>
        </div>
        <button
          onClick={onToggle}
          className={`rounded-full px-3 py-0.5 text-xs font-medium tracking-wide transition ${
            page.is_published ? 'badge-published' : 'badge-draft'
          }`}
        >
          {page.is_published ? 'Published' : 'Draft'}
        </button>
      </div>

      <div className="p-5">
        <h3 className="line-clamp-1 text-lg font-semibold">{page.name}</h3>
        <p className="mt-1 font-mono text-xs text-[var(--signal)]">/{page.slug}</p>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
          {page.description || 'No AI summary yet.'}
        </p>

        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <span>{getOfferCount(page)} offers</span>
          <span className="inline-flex items-center gap-1 text-[var(--signal)]">
            <Gauge className="size-3" />
            {score}% ready
          </span>
        </div>

        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
          <Activity className="size-3 text-[var(--signal)]" />
          {eventCount} agent signals
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
          <a href={`/dashboard/${page.id}`} className={pageActionClass} aria-label="Edit page">
            <Pencil className="size-4" />
          </a>
          <a href={`/dashboard/${page.id}/settings`} className={pageActionClass} aria-label="Page settings">
            <Settings className="size-4" />
          </a>
          <a href={`/dashboard/${page.id}/test`} className={pageActionClass} aria-label="Test page with AI agents">
            <Play className="size-4" />
          </a>
          <a href={`/dashboard/analytics?page=${encodeURIComponent(page.id)}`} className={pageActionClass} aria-label="View page analytics">
            <BarChart3 className="size-4" />
          </a>
          <a href={agentRuntimeUrl(`/${page.slug}`)} className={pageActionClass} aria-label="Preview page">
            <ExternalLink className="size-4" />
          </a>
          <button onClick={onCopy} className={pageActionClass} aria-label="Copy page URL">
            <Copy className="size-4" />
          </button>
          <button onClick={onDuplicate} className={pageActionClass} aria-label="Duplicate page" title="Duplicate as draft">
            <CopyPlus className="size-4" />
          </button>
          <button onClick={onDelete} className={`${pageActionClass} text-red-300`} aria-label="Delete page">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </article>
  )
}
