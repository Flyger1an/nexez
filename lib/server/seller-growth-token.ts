import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

export const SELLER_GROWTH_INVITE_COOKIE = 'nexez_seller_growth_invite'
export const SELLER_GROWTH_INVITE_TOKEN_BYTES = 32

export function createSellerGrowthInviteToken(): string {
  return randomBytes(SELLER_GROWTH_INVITE_TOKEN_BYTES).toString('base64url')
}

export function deriveSellerGrowthInviteToken(seed: string): string {
  return createHash('sha256')
    .update(`nexez-seller-growth-cohort-v1:${seed}`)
    .digest('base64url')
}

export function hashSellerGrowthInviteToken(token: string): string {
  return createHash('sha256').update(`nexez-seller-growth-v1:${token}`).digest('hex')
}

export function isSellerGrowthInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token)
}
