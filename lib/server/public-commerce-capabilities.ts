import 'server-only'

import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { resolveCheckoutEligibleSlugs } from './agentic-commerce-eligibility'
import { resolveNegotiationEligibleSlugs } from './negotiation-visibility'

export type PublicCommerceCapabilities = {
  /** Published slugs whose configured negotiable offer is also plan-entitled. */
  negotiationEligibleSlugs: Set<string>
  /** Published slugs whose owner has an operational Nexez payout account. */
  checkoutReadySlugs: Set<string>
}

/** Resolve private owner state once at the public protocol boundary. Public
 * page JSON remains incapable of self-asserting either paid negotiation access
 * or payout readiness. Missing privileged configuration fails closed. */
export async function resolvePublicCommerceCapabilities(
  slugs: string[],
): Promise<PublicCommerceCapabilities> {
  const requested = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))]
  if (!requested.length) {
    return { negotiationEligibleSlugs: new Set(), checkoutReadySlugs: new Set() }
  }

  try {
    const negotiationPromise = resolveNegotiationEligibleSlugs(requested)
    const checkoutPromise = hasSupabaseAdminEnv() && Boolean(process.env.STRIPE_SECRET_KEY)
      ? resolveCheckoutEligibleSlugs(createAdminClient(), requested)
      : Promise.resolve(new Set<string>())
    const [negotiationEligibleSlugs, checkoutReadySlugs] = await Promise.all([
      negotiationPromise,
      checkoutPromise,
    ])
    return { negotiationEligibleSlugs, checkoutReadySlugs }
  } catch {
    // Public discovery must remain readable if privileged billing state cannot
    // be resolved, but it must not advertise checkout or negotiation actions.
    return { negotiationEligibleSlugs: new Set(), checkoutReadySlugs: new Set() }
  }
}
