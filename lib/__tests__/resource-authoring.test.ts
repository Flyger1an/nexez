import { describe, expect, it } from 'vitest'
import {
  validateResourcePoolDraft,
  validateResourceWindowDraft,
} from '../resource-authoring'

describe('resource authoring validation', () => {
  it('canonicalizes bounded pool and window drafts', () => {
    expect(validateResourcePoolDraft({
      resourceKey: 'guest-capacity',
      label: '  Guest   capacity ',
      unitLabel: ' guests ',
      kind: 'reusable',
      totalQuantity: 60,
    })).toEqual({
      ok: true,
      value: {
        resourceKey: 'guest-capacity',
        label: 'Guest capacity',
        unitLabel: 'guests',
        kind: 'reusable',
        totalQuantity: 60,
        status: 'active',
      },
    })
    expect(validateResourceWindowDraft({
      windowKey: 'evening',
      label: 'Dinner evening',
      startsAt: '2030-09-03T18:00:00-05:00',
      endsAt: '2030-09-03T23:00:00-05:00',
      totalQuantity: 40,
      status: 'paused',
    })).toMatchObject({
      ok: true,
      value: {
        startsAt: '2030-09-03T23:00:00.000Z',
        endsAt: '2030-09-04T04:00:00.000Z',
        status: 'paused',
      },
    })
  })

  it('rejects unsafe labels, kinds, quantities, and windows', () => {
    expect(validateResourcePoolDraft({ resourceKey: 'Bad Key', label: 'Pool', unitLabel: 'units', kind: 'consumable', totalQuantity: 1 })).toMatchObject({ ok: false })
    expect(validateResourcePoolDraft({ resourceKey: 'pool', label: '<script>', unitLabel: 'units', kind: 'consumable', totalQuantity: 1 })).toMatchObject({ ok: false })
    expect(validateResourcePoolDraft({ resourceKey: 'pool', label: 'Pool', unitLabel: 'units', kind: 'external', totalQuantity: 1 })).toMatchObject({ ok: false })
    expect(validateResourcePoolDraft({ resourceKey: 'pool', label: 'Pool', unitLabel: 'units', kind: 'consumable', totalQuantity: 1.5 })).toMatchObject({ ok: false })
    expect(validateResourceWindowDraft({ windowKey: 'window', label: 'Window', startsAt: '2030-01-02', endsAt: '2030-01-01', totalQuantity: 1 })).toMatchObject({ ok: false })
  })
})
