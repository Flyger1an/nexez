import { NextResponse } from 'next/server'
import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getReadinessScore, getTrustScore } from '../../../lib/agent-page'
import { supabase } from '../../../lib/supabase'

/**
 * Machine-readable Agent-Ready badge verification at /<slug>/badge.json.
 * A third party (or the embedding site) fetches this to confirm the badge is
 * authentic and current: issuer, live readiness/trust, verified status.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  const base = getBaseUrl()

  if (!page) {
    return NextResponse.json(
      { issuer: 'nexez', slug, verified: false, valid: false, reason: 'No published page for this slug.' },
      { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } },
    )
  }

  return NextResponse.json(
    {
      issuer: 'nexez',
      valid: true,
      slug: page.slug,
      name: page.name,
      page_url: `${base}/${page.slug}`,
      agent_json_url: `${base}/${page.slug}/agent.json`,
      badge_svg_url: `${base}/${page.slug}/badge.svg`,
      readiness: getReadinessScore(page),
      trust: getTrustScore(page),
      domain_verified: Boolean(page.custom_domain_verified),
      custom_domain: page.custom_domain_verified ? page.custom_domain || null : null,
      issued_at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=1800' } },
  )
}
