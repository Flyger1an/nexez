import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => {
  class GrowthControlError extends Error {
    constructor(message: string, readonly code: string) {
      super(message)
    }
  }
  return {
    rpc: vi.fn(),
    snapshot: {
      cohortMembers: [{
        id: '33333333-3333-4333-8333-333333333333',
        email: 'owner@acme.test',
        label: 'Acme',
        status: 'pending',
        expiresAt: '2026-08-09T00:00:00.000Z',
        acceptedAt: null,
        qualifiedAt: null,
        deliveryCount: 0,
        lastSentAt: null,
        createdAt: '2026-07-26T00:00:00.000Z',
      }],
    },
    getSnapshot: vi.fn(),
    GrowthControlError,
  }
})

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({ rpc: refs.rpc })),
}))
vi.mock('./growth-control', () => ({
  getGrowthControlSnapshot: refs.getSnapshot,
  GrowthControlError: refs.GrowthControlError,
}))

import { applyGrowthCohortControl, recordGrowthCohortDelivery } from './growth-cohort'
import { deriveSellerGrowthInviteToken, hashSellerGrowthInviteToken } from './seller-growth-token'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '33333333-3333-4333-8333-333333333333'
const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222'

describe('growth cohort controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.getSnapshot.mockResolvedValue(refs.snapshot)
    refs.rpc.mockResolvedValue({
      data: { member_id: MEMBER_ID, replayed: false },
      error: null,
    })
  })

  it('derives a replay-safe token and sends only its hash to the database', async () => {
    const result = await applyGrowthCohortControl({
      campaignId: CAMPAIGN_ID,
      actorId: 'admin-1',
      action: 'cohort_add',
      reason: 'Opening cohort candidate',
      idempotencyKey: IDEMPOTENCY_KEY,
      email: 'owner@acme.test',
      label: 'Acme',
    })

    const token = deriveSellerGrowthInviteToken(IDEMPOTENCY_KEY)
    expect(result).toMatchObject({
      member: { id: MEMBER_ID, email: 'owner@acme.test' },
      token,
      replayed: false,
    })
    expect(refs.rpc).toHaveBeenCalledWith('apply_seller_growth_cohort_control', {
      p_campaign_id: CAMPAIGN_ID,
      p_actor_id: 'admin-1',
      p_action: 'cohort_add',
      p_reason: 'Opening cohort candidate',
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_member_id: null,
      p_email: 'owner@acme.test',
      p_label: 'Acme',
      p_token_hash: hashSellerGrowthInviteToken(token),
      p_expires_at: null,
    })
    expect(JSON.stringify(refs.rpc.mock.calls)).not.toContain(token)
  })

  it('maps database conflicts without losing the operator-safe message', async () => {
    refs.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'That business already has a cohort seat.' },
    })

    await expect(applyGrowthCohortControl({
      campaignId: CAMPAIGN_ID,
      actorId: 'admin-1',
      action: 'cohort_add',
      reason: 'Duplicate proof',
      idempotencyKey: IDEMPOTENCY_KEY,
      email: 'owner@acme.test',
    })).rejects.toMatchObject({
      code: 'conflict',
      message: 'That business already has a cohort seat.',
    })
  })

  it('records delivery through the bounded database function', async () => {
    await recordGrowthCohortDelivery(MEMBER_ID)
    expect(refs.rpc).toHaveBeenCalledWith('record_seller_growth_cohort_delivery', {
      p_member_id: MEMBER_ID,
    })
  })
})
