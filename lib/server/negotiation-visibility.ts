import 'server-only'

/**
 * Single source of truth for whether the AGENT-FACING surfaces (agent.json,
 * mcp.json, the MCP JSON-RPC endpoint, llms.txt) should advertise negotiation
 * for a page. Mirrors the public HTML render gate (app/[slug]/page.tsx): the page
 * must have a negotiable offer AND the owner's plan must allow `negotiation`,
 * else an agent would POST /api/negotiations and hit a 403. Missing privileged
 * billing access fails closed: public protocols must never advertise a paid
 * capability whose entitlement cannot be verified.
 */
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { planAllows } from '../billing'
import { getOwnerPlanIds, ownerAllows } from './plan'
import { getCheckoutOffers, type AgentPage } from '../agent-page'
import { getPagePrivateMeta } from './page-private-meta'

export async function resolveNegotiationAllowed(page: AgentPage): Promise<boolean> {
  const hasNegotiableOffer = getCheckoutOffers(page).some(
    (o) => (o as { offerType?: string }).offerType === 'negotiable',
  )
  if (!hasNegotiableOffer) return false
  if (!hasSupabaseAdminEnv()) return false
  const privateMeta = await getPagePrivateMeta(page.id)
  return privateMeta.ownerId ? ownerAllows(createAdminClient(), privateMeta.ownerId, 'negotiation') : false
}

/** Resolve the published slugs whose owners currently have the negotiation
 * entitlement. Callers still intersect this set with offer-level negotiability.
 * Missing privileged access or any owner lookup failure yields no eligible slugs.
 */
export async function resolveNegotiationEligibleSlugs(slugs: string[]): Promise<Set<string>> {
  const eligible = new Set<string>()
  const requested = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))]
  if (!requested.length || !hasSupabaseAdminEnv()) return eligible

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pages')
      .select('slug, owner_id')
      .in('slug', requested)
      .eq('is_published', true)
      .returns<Array<{ slug: string; owner_id: string | null }>>()
    if (error || !data?.length) return eligible

    const ownerIds = [...new Set(data.map((row) => row.owner_id).filter(Boolean))] as string[]
    const plansByOwner = await getOwnerPlanIds(admin, ownerIds)
    const allowedOwners = new Set(
      ownerIds.filter((ownerId) => planAllows(plansByOwner[ownerId] ?? 'free', 'negotiation')),
    )
    for (const row of data) {
      if (row.owner_id && allowedOwners.has(row.owner_id)) eligible.add(row.slug)
    }
  } catch {
    return new Set()
  }
  return eligible
}
