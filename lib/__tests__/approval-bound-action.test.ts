import { describe, expect, it, vi } from 'vitest'
import {
  ApprovalBoundActionError,
  executeApprovalBoundAction,
} from '../approval-bound-action'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('executeApprovalBoundAction', () => {
  it('validates first, binds the issued token to the unchanged payload, and adds duplicate protection', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        approvalTokenRequired: true,
        approvalToken: 'v1.payload.signature',
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, negotiationUrl: 'https://nexez.app/negotiate/n1' }))

    const result = await executeApprovalBoundAction({
      url: 'https://nexez.app/api/negotiations',
      input: {
        slug: 'acme',
        offer: 'services-0',
        budget: '$900',
        requestedTerms: { revisions: 2 },
        approvalToken: 'caller-supplied-token',
        dryRun: false,
        userApproved: true,
      },
      idempotencyKey: 'test:approval-action:123456',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const validationBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    const liveBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))
    expect(validationBody).toEqual({
      slug: 'acme',
      offer: 'services-0',
      budget: '$900',
      requestedTerms: { revisions: 2 },
      dryRun: true,
    })
    expect(liveBody).toEqual({
      slug: 'acme',
      offer: 'services-0',
      budget: '$900',
      requestedTerms: { revisions: 2 },
      dryRun: false,
      approvalToken: 'v1.payload.signature',
    })
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get('idempotency-key'))
      .toBe('test:approval-action:123456')
    expect(result.result.negotiationUrl).toBe('https://nexez.app/negotiate/n1')
  })

  it('stops before execution when validation fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'Offer unavailable.' }, 404))

    await expect(executeApprovalBoundAction({
      url: '/api/checkout',
      input: { slug: 'missing', offer: 'services-0' },
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({ status: 404, message: 'Offer unavailable.' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails closed when enforcement is reported but no token is issued', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, approvalTokenRequired: true }))

    await expect(executeApprovalBoundAction({
      url: '/api/checkout',
      input: { slug: 'acme', offer: 'services-0' },
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({
      status: 502,
      response: { code: 'approval_token_missing' },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('remains compatible while enforcement is optional and the server issues no token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, approvalTokenRequired: false }))
      .mockResolvedValueOnce(jsonResponse({ url: 'https://checkout.example.com/session' }))

    await executeApprovalBoundAction({
      url: '/api/checkout',
      input: { slug: 'acme', offer: 'services-0' },
      fetchImpl: fetchImpl as typeof fetch,
      idempotencyKey: 'test:optional-action:123456',
    })

    const liveBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))
    expect(liveBody.approvalToken).toBeUndefined()
    expect(liveBody.dryRun).toBe(false)
  })

  it('exposes the live response when execution fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ approvalToken: 'v1.payload.signature' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Duplicate action.', code: 'idempotency_conflict' }, 409))

    await expect(executeApprovalBoundAction({
      url: '/api/checkout',
      input: { slug: 'acme', offer: 'services-0' },
      fetchImpl: fetchImpl as typeof fetch,
      idempotencyKey: 'test:duplicate-action:123456',
    })).rejects.toEqual(expect.objectContaining<Partial<ApprovalBoundActionError>>({
      status: 409,
      response: expect.objectContaining({ code: 'idempotency_conflict' }),
    }))
  })
})
