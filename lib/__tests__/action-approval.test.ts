import { describe, expect, it } from 'vitest'
import {
  actionRequestHash,
  approvalInput,
  issueActionApprovalToken,
  parsePublicActionIdempotencyKey,
  scopedIdempotencyHash,
  verifyActionApprovalToken,
} from '../action-approval'

const secret = 'test-secret-with-at-least-thirty-two-characters'
const input = {
  slug: 'acme',
  offer: 'services-0',
  query: 'Book the selected offer.',
  buyerEmail: 'buyer@example.com',
  dryRun: true,
}

describe('agent action approval', () => {
  it('binds a short-lived token to the exact action payload', () => {
    const issued = issueActionApprovalToken('checkout', input, { secret, nowMs: 1_000, ttlMs: 60_000 })
    expect(issued).toBeTruthy()

    expect(verifyActionApprovalToken(issued!.approvalToken, 'checkout', input, { secret, nowMs: 30_000 })).toMatchObject({ ok: true })
    expect(
      verifyActionApprovalToken(issued!.approvalToken, 'checkout', { ...input, offer: 'services-1' }, { secret, nowMs: 30_000 }),
    ).toEqual({ ok: false, reason: 'payload_mismatch' })
    expect(verifyActionApprovalToken(issued!.approvalToken, 'negotiation', input, { secret, nowMs: 30_000 }))
      .toEqual({ ok: false, reason: 'action_mismatch' })
  })

  it('rejects expired and tampered approval tokens', () => {
    const issued = issueActionApprovalToken('checkout', input, { secret, nowMs: 1_000, ttlMs: 1_000 })!
    expect(verifyActionApprovalToken(issued.approvalToken, 'checkout', input, { secret, nowMs: 3_000 }))
      .toEqual({ ok: false, reason: 'expired' })
    expect(verifyActionApprovalToken(`${issued.approvalToken}x`, 'checkout', input, { secret, nowMs: 1_500 }))
      .toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('refuses weak signing secrets and oversized token input', () => {
    expect(issueActionApprovalToken('checkout', input, { secret: 'too-short' })).toBeNull()
    expect(verifyActionApprovalToken('x'.repeat(4_097), 'checkout', input, { secret }))
      .toEqual({ ok: false, reason: 'malformed' })
  })

  it('binds commercial terms while allowing identity to be added only after consent', () => {
    expect(approvalInput({
      ...input,
      approvalToken: 'secret',
      userApproved: true,
      buyerName: 'Buyer',
      buyerReference: 'PO-9',
      buyerAgent: 'test-agent',
      contact: 'buyer@example.com',
    })).toEqual({
      slug: 'acme',
      offer: 'services-0',
      query: 'Book the selected offer.',
    })

    const issued = issueActionApprovalToken('checkout', input, { secret, nowMs: 1_000, ttlMs: 60_000 })!
    expect(verifyActionApprovalToken(issued.approvalToken, 'checkout', {
      ...input,
      buyerEmail: 'approved-buyer@example.com',
      buyerName: 'Approved Buyer',
    }, { secret, nowMs: 30_000 })).toMatchObject({ ok: true })
  })

  it('validates and scopes public idempotency keys without storing the raw key', () => {
    const valid = parsePublicActionIdempotencyKey(new Request('https://nexez.test', {
      headers: { 'idempotency-key': 'buyer-order-1234567890' },
    }))
    expect(valid).toEqual({ ok: true, key: 'buyer-order-1234567890' })
    expect(parsePublicActionIdempotencyKey(new Request('https://nexez.test', {
      headers: { 'idempotency-key': 'short' },
    })).ok).toBe(false)
    expect(scopedIdempotencyHash('checkout', 'acme', 'buyer-order-1234567890')).toMatch(/^[a-f0-9]{64}$/)
    expect(scopedIdempotencyHash('checkout', 'acme', 'buyer-order-1234567890'))
      .not.toBe(scopedIdempotencyHash('negotiation', 'acme', 'buyer-order-1234567890'))
    expect(actionRequestHash('negotiation', { slug: 'acme', offer: 'services-0', budget: '$90' }))
      .not.toBe(actionRequestHash('negotiation', { slug: 'acme', offer: 'services-0', budget: '$75' }))
  })
})
