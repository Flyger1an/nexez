import { CopyPlus, ExternalLink, Loader2, Play } from 'lucide-react'
import { PageEditor } from './usePageEditor'
import { agentRuntimeUrl } from '../../lib/site'

export function EditorToolbar({ e }: { e: PageEditor }) {
  const page = e.page
  return (
    <div className="flex justify-end">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={e.startReanalysis}
          disabled={e.syncing || !e.websiteUrl}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#7C3AED]/40 px-4 py-2 text-sm text-[#C4B5FD] hover:bg-[#7C3AED]/10 disabled:opacity-50"
        >
          {e.syncing ? <Loader2 className="size-4 animate-spin" /> : null}
          {e.syncing ? 'Analyzing...' : 'Re-analyze from Website (Preview)'}
        </button>
        <a
          href={`/dashboard/${page.id}/test`}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-cyan-300/40 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10"
        >
          Test with agents
          <Play className="size-4" />
        </a>
        <a
          href={`/dashboard/${page.id}/settings`}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-300/40 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-300/10"
        >
          Versions & History
        </a>
        <button
          onClick={e.duplicateThisPage}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10"
          title="Clone this page into a new draft"
        >
          <CopyPlus className="size-4" />
          Duplicate
        </button>
        <a
          href="/dashboard/competitors"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Competitor Intel
        </a>
        <a
          href={agentRuntimeUrl(`/${page.slug}`)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          View public page
          <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  )
}
