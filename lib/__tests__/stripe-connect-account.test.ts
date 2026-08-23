import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: class {
    accounts = { create: refs.create }
  },
}))

import { createStripeConnectAccount } from '../stripe-billing'

describe('Stripe Connect account creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_connect')
    refs.create.mockResolvedValue({ id: 'acct_owner_1' })
  })

  it('uses a stable owner-scoped idempotency key so a persistence retry recovers the same account', async () => {
    await createStripeConnectAccount('owner-1', 'owner@example.test', 'Owner Co')
    await createStripeConnectAccount('owner-1', 'owner@example.test', 'Owner Co')

    expect(refs.create).toHaveBeenCalledTimes(2)
    for (const call of refs.create.mock.calls) {
      expect(call[1]).toEqual({ idempotencyKey: 'nexez-connect-account-v1:owner-1' })
    }
    expect(refs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'express',
        email: 'owner@example.test',
        metadata: { nexez_owner_id: 'owner-1' },
      }),
      { idempotencyKey: 'nexez-connect-account-v1:owner-1' },
    )
  })
})
