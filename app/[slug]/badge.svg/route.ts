import { AgentPage, PUBLIC_PAGE_SELECT, getCertification } from '../../../lib/agent-page'
import { buildAgentReadyBadgeSvg } from '../../../lib/badge'
import { supabase } from '../../../lib/supabase'

/**
 * Embeddable Agent-Ready badge: GET /<slug>/badge.svg
 * Businesses embed it on their human site, typically wrapped in a link back to
 * the agent page. The certified claim appears only while every standard check
 * passes; incomplete pages receive a plain readiness badge.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  const certification = page ? getCertification(page) : null
  const score = certification?.readiness ?? 0
  const verified = page ? Boolean(page.custom_domain_verified) : false
  const svg = buildAgentReadyBadgeSvg(score, verified, certification?.certified ?? false)

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Short cache so the score stays roughly fresh; CDN-friendly.
      'Cache-Control': 'public, max-age=300, s-maxage=1800',
    },
  })
}
