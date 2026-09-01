import { describe, expect, it, vi } from 'vitest'
import {
  executePreparedNexxiBookingAction,
  prepareNexxiBookingAction,
  publicApprovalPayload,
  resolveNexxiCommerceAction,
  validatePreparedNexxiBookingAction,
} from './nexxi-commerce-action'

function page(offer: Record<string, unknown>, slug = 'demo') {
  return {
    id: slug,
    name: 'Demo',
    slug,
    is_published: true,
    services: [offer],
    products: [],
    faqs: [],
  } as any
}

function dbFor(value: any) {
  const query: any = {}
  for (const method of ['select', 'eq']) query[method] = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => ({ data: value, error: null }))
  return { from: vi.fn(() => query) } as any
}

function recurringOffer() {
  return {
    name: 'Care plan',
    price: '$100',
    url: '',
    recurringTerms: {
      schemaVersion: 1,
      paymentModel: 'fixed-per-period',
      schedule: { mode: 'fixed', cadence: { interval: 'month', intervalCount: 1 } },
      startPolicy: 'first-successful-payment',
      endPolicy: 'until-cancelled',
      cancellationPolicy: 'period-end',
      pausePolicy: 'unsupported',
    },
  }
}

function stagedOffer() {
  return {
    name: 'Project',
    price: '$100',
    url: '',
    stagedSettlementTerms: {
      schemaVersion: 1,
      paymentModel: 'staged-fixed-total',
      approvalPolicy: 'buyer-approves-each-stage',
      mutationPolicy: 'immutable-after-first-payment',
      stages: [
        { id: 'deposit', label: 'Deposit', kind: 'commitment', allocationBps: 5000 },
        { id: 'final', label: 'Final', kind: 'completion', allocationBps: 5000 },
      ],
    },
  }
}

function reservableOffer() {
  return {
    name: 'Rental',
    price: '$100',
    url: '',
    reservableResourceTerms: {
      schemaVersion: 1,
      requirements: [{
        poolId: '11111111-1111-4111-8111-111111111111',
        quantity: { source: 'fixed', value: 1 },
      }],
    },
  }
}

describe('Nexxi authoritative commerce action preparation', () => {
  it('selects every checkout family from current offer data, never a caller endpoint', async () => {
    const variants = [
      [{ name: 'Simple', price: '$100', url: '' }, 'one_time', '/api/checkout'],
      [{
        name: 'Configured',
        price: '$100',
        url: '',
        customerInputs: [{ key: 'quantity', label: 'Quantity', valueType: 'quantity', required: true, askBuyer: 'How many?' }],
      }, 'configured', '/api/checkout'],
      [recurringOffer(), 'recurring', '/api/service-agreements/checkout'],
      [stagedOffer(), 'staged', '/api/staged-settlements/checkout'],
      [reservableOffer(), 'reservable', '/api/reservable-resources/checkout'],
    ] as const

    for (const [offer, rail, endpointPath] of variants) {
      const resolved = await resolveNexxiCommerceAction(dbFor(page(offer)), {
        slug: 'demo',
        offer: 'services-0',
        endpoint: 'https://attacker.test/charge',
      })
      expect(resolved).toMatchObject({ rail, endpointPath })
    }
  })

  it('dry-runs exact normalized input, stores the token privately, and executes the same tuple', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(options?.body)),
        headers: new Headers(options?.headers),
      })
      const response = calls.length === 1
        ? {
            ok: true,
            approvalTokenRequired: true,
            approvalToken: 'v1.bound.signature',
            provider: 'stripe',
            amountCents: 2500,
            currency: 'usd',
            offerConfiguration: { quantity: 2 },
            requiredOfferConfigurationFields: ['quantity'],
          }
        : { ok: true, url: 'https://checkout.stripe.test/session' }
      return new Response(JSON.stringify(response), { status: 200 })
    }) as typeof fetch
    const offer = {
      name: 'Configured',
      price: '$20',
      url: '',
      customerInputs: [{
        key: 'quantity',
        label: 'Quantity',
        valueType: 'quantity',
        required: true,
        askBuyer: 'How many?',
        affects: ['price'],
        pricing: { model: 'quantity-delta', unitDelta: '5', includedQuantity: 1 },
      }],
    }
    const db = dbFor(page(offer))

    const prepared = await prepareNexxiBookingAction(
      db,
      {
        slug: 'demo',
        offer: 'services-0',
        offerConfiguration: { quantity: 2 },
        endpoint: 'https://attacker.test/charge',
        buyerEmail: 'victim@example.com',
      },
      { email: 'buyer@example.com', userId: 'buyer-1' },
      { baseUrl: 'https://nexez.test', fetchImpl },
    )

    expect(calls[0].url).toBe('https://nexez.test/api/checkout')
    expect(calls[0].body).toMatchObject({
      slug: 'demo',
      offer: 'services-0',
      offerConfiguration: { quantity: 2 },
      buyerEmail: 'buyer@example.com',
      buyerReference: 'buyer-1',
      buyerAgent: 'Nexxi',
      dryRun: true,
    })
    expect(JSON.stringify(calls[0].body)).not.toContain('victim')
    expect(prepared.descriptor).toMatchObject({
      rail: 'configured',
      endpointFamily: '/api/checkout',
      idempotency: { required: false, boundToApproval: true },
      dryRun: { required: true, completed: true, amountCents: 2500, currency: 'usd' },
    })

    const publicPayload = publicApprovalPayload(prepared.storedPayload)
    expect(JSON.stringify(publicPayload)).not.toContain('v1.bound.signature')
    expect(JSON.stringify(publicPayload)).not.toContain('victim')
    expect(JSON.stringify(publicPayload)).not.toContain('attacker')
    expect(publicPayload).toHaveProperty('commerceAction')
    expect(Object.keys(publicPayload).some((key) => key.startsWith('__nexxiPrepared'))).toBe(false)

    await validatePreparedNexxiBookingAction(db, prepared.storedPayload)
    await executePreparedNexxiBookingAction(prepared.storedPayload, {
      baseUrl: 'https://nexez.test',
      fetchImpl,
    })

    expect(calls).toHaveLength(2)
    expect(calls[1].url).toBe(calls[0].url)
    expect(calls[1].headers.get('idempotency-key')).toBe(calls[0].headers.get('idempotency-key'))
    expect(calls[1].body).toEqual({
      ...calls[0].body,
      dryRun: false,
      approvalToken: 'v1.bound.signature',
    })
  })

  it('requires conversational buyer answers before any dry-run', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const offer = {
      name: 'Configured',
      price: '$20',
      url: '',
      customerInputs: [
        { key: 'quantity', label: 'Quantity', valueType: 'quantity', required: true, askBuyer: 'How many are needed?' },
        { key: 'location', label: 'Service location', valueType: 'location', required: true, askBuyer: 'Where should service happen?' },
      ],
    }

    await expect(prepareNexxiBookingAction(
      dbFor(page(offer)),
      { slug: 'demo', offer: 'services-0', offerConfiguration: { quantity: 2 } },
      { email: 'buyer@example.com', userId: 'buyer-1' },
      { baseUrl: 'https://nexez.test', fetchImpl },
    )).rejects.toMatchObject({
      code: 'buyer_inputs_required',
      buyerInputPrompts: ['Service location: Where should service happen?'],
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('marks staged and reservable actions as idempotency-required', async () => {
    for (const offer of [stagedOffer(), reservableOffer()]) {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        approvalTokenRequired: true,
        approvalToken: 'v1.bound.signature',
        amountCents: 5000,
        currency: 'usd',
      }))) as typeof fetch
      const prepared = await prepareNexxiBookingAction(
        dbFor(page(offer)),
        { slug: 'demo', offer: 'services-0' },
        { email: 'buyer@example.com', userId: 'buyer-1' },
        { baseUrl: 'https://nexez.test', fetchImpl },
      )
      expect(prepared.descriptor.idempotency.required).toBe(true)
    }
  })

  it('rejects a prepared approval when the authoritative rail changes', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      approvalTokenRequired: true,
      approvalToken: 'v1.bound.signature',
      amountCents: 10000,
      currency: 'usd',
    }))) as typeof fetch
    const prepared = await prepareNexxiBookingAction(
      dbFor(page(recurringOffer())),
      { slug: 'demo', offer: 'services-0' },
      { email: null, userId: 'buyer-1' },
      { baseUrl: 'https://nexez.test', fetchImpl },
    )

    await expect(validatePreparedNexxiBookingAction(
      dbFor(page({ name: 'Now one-time', price: '$100', url: '' })),
      prepared.storedPayload,
    )).rejects.toMatchObject({ code: 'stale_action' })
  })

  it('does not create a prepared action when the authoritative dry-run rejects input', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: 'The buyer configuration does not satisfy this offer.',
      code: 'invalid_offer_configuration',
    }), { status: 422 })) as typeof fetch

    await expect(prepareNexxiBookingAction(
      dbFor(page({
        name: 'Configured',
        price: '$100',
        url: '',
        customerInputs: [{ key: 'date', label: 'Date', valueType: 'date', required: true, askBuyer: 'Which date?' }],
      })),
      { slug: 'demo', offer: 'services-0', offerConfiguration: { date: 'not-a-date' } },
      { email: null, userId: 'buyer-1' },
      { baseUrl: 'https://nexez.test', fetchImpl },
    )).rejects.toMatchObject({ status: 422 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
