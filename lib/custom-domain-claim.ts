export type CustomDomainClaim = {
  domain: string
  claimedAt: string | null
  expiresAt: string | null
  verifiedAt: string | null
  owned: boolean
  available: boolean
}

export type CustomDomainClaimState = 'none' | 'reserved' | 'expired' | 'verified' | 'lost' | 'available' | 'unknown'

export function getCustomDomainClaimState(
  claim: CustomDomainClaim | null,
  nowMs: number = Date.now(),
): CustomDomainClaimState {
  if (!claim) return 'none'
  if (claim.available) return 'available'
  if (!claim.owned) return 'lost'
  if (claim.verifiedAt) return 'verified'
  if (!claim.expiresAt) return 'unknown'

  const expiryMs = Date.parse(claim.expiresAt)
  if (!Number.isFinite(expiryMs)) return 'unknown'
  return expiryMs <= nowMs ? 'expired' : 'reserved'
}

export function formatCustomDomainClaimExpiry(expiresAt: string, locale?: string): string {
  const value = new Date(expiresAt)
  if (!Number.isFinite(value.getTime())) return 'the listed date'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value)
}
