import { NextResponse } from 'next/server'
import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getCertification, getTrustScore } from '../../../lib/agent-page'
import { supabase } from '../../../lib/supabase'
import { renamedPageArtifactRedirect } from '../../../lib/server/public-identifier'

/**
 * Machine-readable Agent-Ready badge verification at /<slug>/badge.json.
 * A third party (or the embedding site) fetches this to confirm the badge is
 * authentic and current: issuer, live readiness/trust, verified status.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  const base = getBaseUrl()

  if (!page) {
    const redirect = await renamedPageArtifactRedirect(request, slug)
    if (redirect) return redirect
    return NextResponse.json(
      { issuer: 'nexez', slug, verified: false, valid: false, reason: 'No published page for this slug.' },
      { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } },
    )
  }

  const certification = getCertification(page)

  return NextResponse.json(
    {
      schema_version: 'nexez.agent-ready-verification.v1',
      issuer: 'nexez',
      valid: true,
      certified: certification.certified,
      status: certification.status,
      slug: page.slug,
      name: page.name,
      page_url: `${base}/${page.slug}`,
      agent_json_url: `${base}/${page.slug}/agent.json`,
      badge_svg_url: `${base}/${page.slug}/badge.svg`,
      standard: certification.standard,
      criteria: {
        met: certification.criteria_met,
        total: certification.criteria_total,
        missing: certification.missing,
      },
      readiness: certification.readiness,
      trust: getTrustScore(page),
      identity_verification: {
        domain_verified: Boolean(page.custom_domain_verified),
        custom_domain: page.custom_domain_verified ? page.custom_domain || null : null,
      },
      evaluated_at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=1800' } },
  )
}
