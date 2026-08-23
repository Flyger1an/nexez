import { describe, expect, it } from 'vitest'
import {
  isSupportIncident,
  projectSupportQueue,
  routeSupportQueue,
  supportServiceForPlan,
} from './support-routing'

describe('supportServiceForPlan', () => {
  it.each(['free', 'launch', 'pro'])('%s receives standard support', (planId) => {
    expect(supportServiceForPlan(planId)).toEqual({
      planId,
      tier: 'standard',
      priorityRouting: false,
      upgradePlanId: 'scale',
    })
  })

  it.each(['scale', 'enterprise'])('%s receives priority support', (planId) => {
    expect(supportServiceForPlan(planId)).toEqual({
      planId,
      tier: 'priority',
      priorityRouting: true,
      upgradePlanId: null,
    })
  })

  it.each([null, undefined, '', 'premium', 42, { planId: 'scale' }])(
    'fails malformed plan value %j closed to standard support',
    (planId) => {
      expect(supportServiceForPlan(planId)).toMatchObject({
        planId: 'free',
        tier: 'standard',
        priorityRouting: false,
      })
    },
  )
})

describe('routeSupportQueue', () => {
  const tickets = [
    {
      id: 'paid-low',
      owner_id: 'paid-owner',
      subject: '  Need   help with checkout  ',
      priority: 'low',
      created_at: '2026-08-22T12:00:00.000Z',
      metadata: { support_service_tier_at_submission: 'standard' },
      query: 'private ticket body',
    },
    {
      id: 'standard-urgent',
      owner_id: 'standard-owner',
      subject: 'Production checkout unavailable',
      priority: 'urgent',
      created_at: '2026-08-22T11:00:00.000Z',
      metadata: { support_service_tier_at_submission: 'priority' },
    },
  ]

  it('derives priority from the current plan and ignores direct metadata overrides', () => {
    const routed = routeSupportQueue(tickets, {
      'paid-owner': 'scale',
      'standard-owner': 'free',
    })

    expect(routed.map((ticket) => ticket.id)).toEqual(['paid-low', 'standard-urgent'])
    expect(routed[0].supportService.tier).toBe('priority')
    expect(routed[1].supportService.tier).toBe('standard')
    expect(isSupportIncident(routed[0])).toBe(false)
    expect(isSupportIncident(routed[1])).toBe(true)
  })

  it('changes routing on downgrade while keeping urgent severity actionable', () => {
    const beforeDowngrade = routeSupportQueue(tickets, {
      'paid-owner': 'scale',
      'standard-owner': 'free',
    })
    const afterDowngrade = routeSupportQueue(tickets, {
      'paid-owner': 'pro',
      'standard-owner': 'free',
    })

    expect(beforeDowngrade.map((ticket) => ticket.id)).toEqual(['paid-low', 'standard-urgent'])
    expect(afterDowngrade.map((ticket) => ticket.id)).toEqual(['standard-urgent', 'paid-low'])
    expect(afterDowngrade[0]).toMatchObject({
      priority: 'urgent',
      supportService: { tier: 'standard', priorityRouting: false },
    })
  })

  it('projects only the compact operator-safe fields in routed order', () => {
    const routed = routeSupportQueue(tickets, {
      'paid-owner': 'scale',
      'standard-owner': 'free',
    })

    const projected = projectSupportQueue(routed, 1)

    expect(projected).toEqual([{
      id: 'paid-low',
      subject: 'Need help with checkout',
      severity: 'low',
      createdAt: '2026-08-22T12:00:00.000Z',
      serviceTier: 'priority',
      planId: 'scale',
    }])
    expect(projected[0]).not.toHaveProperty('owner_id')
    expect(projected[0]).not.toHaveProperty('metadata')
    expect(projected[0]).not.toHaveProperty('query')
  })
})
