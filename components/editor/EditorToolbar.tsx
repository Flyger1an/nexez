import { CopyPlus, ExternalLink, Loader2, MessageCircleQuestion, Play } from 'lucide-react'
import { PageEditor } from './usePageEditor'
import { agentRuntimeUrl, appUrl } from '../../lib/site'
import { surfaceActionClass } from '../dashboard/SurfacePrimitives'

export function EditorToolbar({ e }: { e: PageEditor }) {
  const page = e.page
  return (
    <>
        <a
          href={appUrl(`/create?reinterview=${page.id}`)}
          className={surfaceActionClass}
          title="Interview only the gaps - answers stage as a draft on this listing"
        >
          <MessageCircleQuestion className="size-4" aria-hidden="true" />
          Re-interview
        </a>
        <button
          type="button"
          onClick={e.startReanalysis}
          disabled={e.syncing || !e.websiteUrl}
          className={surfaceActionClass}
        >
          {e.syncing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {e.syncing ? 'Analyzing…' : 'Re-analyze website'}
        </button>
        <a
          href={`/dashboard/${page.id}/test`}
          className={surfaceActionClass}
        >
          Test with agents
          <Play className="size-4" aria-hidden="true" />
        </a>
        <a
          href={`/dashboard/${page.id}/settings`}
          className={surfaceActionClass}
        >
          Versions & History
        </a>
        <button
          type="button"
          onClick={e.duplicateThisPage}
          className={surfaceActionClass}
          title="Clone this listing into a new draft"
        >
          <CopyPlus className="size-4" aria-hidden="true" />
          Duplicate
        </button>
        <a
          href="/simulator?mode=compare"
          className={surfaceActionClass}
        >
          Competitor Intel
        </a>
        <a
          href={agentRuntimeUrl(`/${page.slug}`)}
          target="_blank"
          rel="noreferrer"
          className={surfaceActionClass}
        >
          View public listing
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
    </>
  )
}
