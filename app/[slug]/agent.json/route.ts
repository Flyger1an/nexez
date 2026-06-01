import { notFound } from 'next/navigation'
import { AgentPage } from '../../../lib/agent-page'
import { buildAgentPagePayload } from '../../../lib/agent-manifest'
import { supabase } from '../../../lib/supabase'

type RouteProps = {
  params: Promise<{ slug: string }>
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!page) {
    notFound()
  }

  return Response.json(buildAgentPagePayload(page), {
    headers: {
      'Cache-Control': 'public, max-age=120, s-maxage=300',
    },
  })
}
