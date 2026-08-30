import { describe, expect, it } from 'vitest'
import { summarizeNexxiBetaFunnel, type NexxiBetaEventRow, type NexxiBetaOrderRow } from './nexxi-beta-funnel'

const at = '2026-08-30T00:00:00.000Z'

function event(user_id: string, event_name: string): NexxiBetaEventRow {
  return { user_id, event_name, created_at: at }
}

describe('summarizeNexxiBetaFunnel', () => {
  it('keeps stages cohort-based and non-increasing', () => {
    const events = [
      event('u1', 'app_opened'), event('u2', 'app_opened'), event('u3', 'app_opened'),
      event('u1', 'onboarding_completed'), event('u2', 'onboarding_completed'),
      event('u1', 'agent_turn_completed'), event('u2', 'agent_turn_completed'), event('outside', 'agent_turn_completed'),
      event('u1', 'checkout_started'), event('outside', 'checkout_started'),
    ]
    const orders: NexxiBetaOrderRow[] = [
      { buyer_reference: 'u1', status: 'paid', stripe_livemode: true, created_at: at },
      { buyer_reference: 'outside', status: 'paid', stripe_livemode: true, created_at: at },
    ]

    const result = summarizeNexxiBetaFunnel(events, orders)
    expect(result.map((step) => step.users)).toEqual([3, 2, 2, 1, 1])
    expect(result[1]?.conversionFromPrevious).toBeCloseTo(2 / 3)
    expect(result[4]?.conversionFromPrevious).toBe(1)
  })

  it('excludes test-mode and unresolved transactions', () => {
    const events = ['app_opened', 'onboarding_completed', 'agent_turn_completed', 'checkout_started']
      .map((name) => event('u1', name))
    const orders: NexxiBetaOrderRow[] = [
      { buyer_reference: 'u1', status: 'paid', stripe_livemode: false, created_at: at },
      { buyer_reference: 'u1', status: 'pending', stripe_livemode: true, created_at: at },
    ]
    expect(summarizeNexxiBetaFunnel(events, orders).at(-1)?.users).toBe(0)
  })
})
