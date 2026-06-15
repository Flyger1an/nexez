import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { buildAgentPagePayload } from '../../../lib/agent-manifest'
import { logAgentPageView } from '../../../lib/server/log-agent-page-view'
import { resolveNegotiationAllowed } from '../../../lib/server/negotiation-visibility'
import { supabase } from '../../../lib/supabase'

type RouteProps = {
  params: Promise<{ slug: string }>
}

export async function GET(request: Request, { params }: RouteProps) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!page) {
    notFound()
  }

  // Agents commonly fetch this structured endpoint directly (never loading the
  // HTML page). Log the visit non-blocking so it counts toward agent traffic.
  after(() => logAgentPageView({ page, requestHeaders: request.headers, url: request.url }))

  const negotiationAllowed = await resolveNegotiationAllowed(page)
  const payload = buildAgentPagePayload(page, getRequestBaseUrl(request), { negotiationAllowed })
  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=120, s-maxage=300',
      // The base URL reflects the request host; key the CDN cache on it so a forged
      // x-forwarded-host can't poison the entry served to other hosts.
      Vary: 'x-forwarded-host',
    },
  })
}
