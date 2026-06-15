import 'server-only'

/**
 * Single source of truth for whether the AGENT-FACING surfaces (agent.json,
 * mcp.json, the MCP JSON-RPC endpoint, llms.txt) should advertise negotiation
 * for a page. Mirrors the public HTML render gate (app/[slug]/page.tsx): the page
 * must have a negotiable offer AND the owner's plan must allow `negotiation`,
 * else an agent would POST /api/negotiations and hit a 403. Fails OPEN in
 * non-prod (no service-role env) to match the render.
 */
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { ownerAllows } from './plan'
import { getCheckoutOffers, type AgentPage } from '../agent-page'

export async function resolveNegotiationAllowed(page: AgentPage): Promise<boolean> {
  const hasNegotiableOffer = getCheckoutOffers(page).some(
    (o) => (o as { offerType?: string }).offerType === 'negotiable',
  )
  if (!hasNegotiableOffer) return false
  if (!hasSupabaseAdminEnv()) return true
  return ownerAllows(createAdminClient(), (page as { owner_id?: string }).owner_id, 'negotiation')
}
