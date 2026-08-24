// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../test/dom'
import { OrderOperationsPanel } from './OrderOperationsPanel'

const refs = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refs.refresh }) }))

const ORDER_ID = '00000000-0000-4000-8000-123456789abc'

function props() {
  return {
    order: {
      id: ORDER_ID,
      status: 'paid',
      amountCents: 5_000,
      currency: 'usd',
      refundedCents: 0,
      paymentIntentId: 'pi_1234567890abcdefghijkl',
      channel: 'direct_checkout',
    },
    fulfillment: {
      status: 'not_started' as const,
      version: 1,
      updatedAt: '2026-08-23T12:00:00.000Z',
    },
    requests: [{
      id: 'request-1',
      kind: 'refund_request' as const,
      status: 'open',
      message: 'The service was cancelled.',
      buyerEmail: 'buyer@example.com',
      createdAt: '2026-08-23T12:05:00.000Z',
    }],
    stagedObligationKind: null,
  }
}

describe('OrderOperationsPanel', () => {
  beforeEach(() => refs.refresh.mockClear())
  afterEach(() => vi.unstubAllGlobals())

  it('records a fulfillment transition and refreshes server evidence', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      fulfillment: {
        status: 'in_progress',
        version: 2,
        updated_at: '2026-08-23T13:00:00.000Z',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<OrderOperationsPanel {...props()} />)
    await user.click(screen.getByRole('button', { name: 'In progress' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/orders/${ORDER_ID}/fulfillment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    }))
    expect(await screen.findByText('Fulfillment marked in progress.')).toBeInTheDocument()
    expect(refs.refresh).toHaveBeenCalledOnce()
  })

  it('requires a review step before sending a partial refund', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'paid',
      refundedCents: 1_250,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<OrderOperationsPanel {...props()} />)
    await user.type(screen.getByLabelText('Partial amount (USD)'), '12.50')
    await user.click(screen.getByRole('button', { name: 'Review partial refund' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('Confirm $12.50 refund')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm refund' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/orders/refund', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: ORDER_ID, amount: 12.5 }),
    }))
    expect(await screen.findByText('$12.50 refund recorded.')).toBeInTheDocument()
  })

  it('updates buyer request triage without moving money', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<OrderOperationsPanel {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Mark reviewing' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/orders/request-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'request-1', status: 'acknowledged' }),
    }))
    expect(await screen.findByText('Seller is reviewing')).toBeInTheDocument()
    expect(refs.refresh).toHaveBeenCalledOnce()
  })

  it('reports a request-resolution failure after a successful refund', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/orders/refund') {
        return new Response(JSON.stringify({ status: 'refunded', refundedCents: 5_000 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Request store unavailable.' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OrderOperationsPanel {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Refund full remainder and resolve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm refund' }))

    expect(await screen.findByText(/the refund succeeded, but the customer request still needs to be marked resolved/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps commitment-stage fulfillment unavailable', () => {
    render(<OrderOperationsPanel {...props()} stagedObligationKind="commitment" />)
    expect(screen.getByText(/this payment is a commitment stage, not delivered work/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'In progress' })).not.toBeInTheDocument()
  })
})
