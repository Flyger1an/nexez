export const MARKETPLACE_DISCOVERY_MERCHANT_THRESHOLD = 50

/**
 * Human-facing marketplace discovery is a deliberate launch switch. It is
 * public because client navigation also consumes it, and it is frozen when the
 * application is built. Changing it therefore requires a reviewed deployment.
 *
 * Agent-facing discovery APIs, listing pages, and merchant storefronts do not
 * use this switch. They remain available while marketplace browsing is hidden.
 */
export function parseMarketplaceDiscoveryEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

export const MARKETPLACE_DISCOVERY_ENABLED = parseMarketplaceDiscoveryEnabled(
  process.env.NEXT_PUBLIC_MARKETPLACE_DISCOVERY_ENABLED,
)

export const MARKETPLACE_DISCOVERY_PATHS = ['/discovery', '/leaderboard'] as const
