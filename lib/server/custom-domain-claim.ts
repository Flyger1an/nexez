import 'server-only'

import type { CustomDomainClaim } from '../custom-domain-claim'

type ClaimStatusRow = {
  domain: string | null
  claimed_at: string | null
  expires_at: string | null
  verified_at: string | null
  owned: boolean | null
  available: boolean | null
}

type ClaimStatusClient = {
  rpc: (
    name: 'nz_custom_domain_claim_status',
    args: { p_page_id: string },
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

export async function getCustomDomainClaim(
  client: ClaimStatusClient,
  pageId: string,
): Promise<{ claim: CustomDomainClaim | null; error: string | null }> {
  const { data, error } = await client.rpc('nz_custom_domain_claim_status', { p_page_id: pageId })
  if (error) return { claim: null, error: error.message || 'Custom-domain claim status is unavailable.' }

  const row = Array.isArray(data) ? (data[0] as ClaimStatusRow | undefined) : (data as ClaimStatusRow | null)
  if (!row?.domain) return { claim: null, error: null }

  return {
    claim: {
      domain: row.domain,
      claimedAt: row.claimed_at,
      expiresAt: row.expires_at,
      verifiedAt: row.verified_at,
      owned: row.owned === true,
      available: row.available === true,
    },
    error: null,
  }
}
