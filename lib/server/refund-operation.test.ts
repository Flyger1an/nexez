import { beforeEach, describe, expect, it, vi } from 'vitest'
const refs = vi.hoisted(() => ({ rpc: vi.fn(), create: vi.fn(), retrieve: vi.fn(), charge: vi.fn(), list: vi.fn() }))
vi.mock('../../utils/supabase/admin', () => ({ createAdminClient: () => ({ rpc: refs.rpc }) }))
vi.mock('stripe', () => ({ default: class {
  refunds = { create: refs.create, retrieve: refs.retrieve, list: refs.list }
  charges = { retrieve: refs.charge }
} }))
import { executeRefund } from './refund-operation'
const id1 = '75000000-0000-4000-8000-000000000001'
const id2 = '75000000-0000-4000-8000-000000000002'
const input = { operationId: id1, ownerId: 'owner', kind: 'order' as const, targetId: 'order', currency: 'usd', amount: 20 }
const operation = () => ({ id: id1, state: 'reserved', amount_cents: 2000, captured_cents: 10000,
  currency: 'usd', payment_intent_id: 'pi_fixture', stripe_account: 'acct_fixture',
  provider_refund_id: null as string | null, created_at: new Date().toISOString(), order_status: 'paid', refunded_cents: 0 })

describe('refund failure and retry boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture')
    refs.create.mockResolvedValue({ id: 're_fixture', amount: 2000, currency: 'usd', status: 'succeeded', charge: 'ch_fixture' })
    refs.retrieve.mockResolvedValue({ id: 're_fixture', amount: 2000, currency: 'usd', status: 'succeeded', charge: 'ch_fixture' })
    refs.charge.mockResolvedValue({ id: 'ch_fixture', amount: 10000, currency: 'usd', amount_refunded: 2000, payment_intent: 'pi_fixture' })
    refs.list.mockResolvedValue({ data: [{ id: 're_fixture', amount: 2000, currency: 'usd', status: 'succeeded', charge: 'ch_fixture' }], has_more: false })
  })
  function ledger(op = operation(), failRecordOnce = false) {
    refs.rpc.mockImplementation(async (name, args) => {
      if (name === 'nz_begin_refund') {
        if (args.p_operation_id !== op.id && op.state !== 'succeeded') return { error: { code: 'P0001', message: 'Another refund is awaiting reconciliation.' } }
        return { data: { ...op } }
      }
      if (name === 'nz_record_refund') {
        if (failRecordOnce) { failRecordOnce = false; return { error: { code: '08006' } } }
        op.provider_refund_id = args.p_refund_id; op.state = 'submitted'
        return { data: { ...op } }
      }
      op.state = 'succeeded'; op.refunded_cents = args.p_provider_total
      return { data: { ok: true, status: 'paid', refundedCents: op.refunded_cents, operationId: op.id, refundId: op.provider_refund_id, fully: false } }
    })
    return op
  }
  it('does not refund twice after a committed response is lost', async () => {
    const op = ledger()
    expect((await executeRefund(input)).status).toBe(200)
    expect((await executeRefund(input)).status).toBe(200)
    expect(refs.create).toHaveBeenCalledTimes(1)
    expect(op.refunded_cents).toBe(2000)
    expect(refs.create.mock.calls[0]![1]).toMatchObject({ stripeAccount: 'acct_fixture', idempotencyKey: `nexez-refund-${id1}` })
  })
  it('reuses the exact provider key when recording a successful refund fails', async () => {
    ledger(operation(), true)
    const provider = new Map<string, object>()
    refs.create.mockImplementation(async (_params, options) => {
      if (!provider.has(options.idempotencyKey)) provider.set(options.idempotencyKey,
        { id: 're_once', amount: 2000, currency: 'usd', status: 'succeeded', charge: 'ch_fixture' })
      return provider.get(options.idempotencyKey)
    })
    expect((await executeRefund(input)).status).toBe(503)
    expect((await executeRefund(input)).status).toBe(200)
    expect(provider.size).toBe(1)
  })
  it('does not issue a competing refund while another operation is unresolved', async () => {
    ledger()
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    refs.create.mockImplementation(async () => { await held; return { id: 're_fixture', amount: 2000, currency: 'usd', status: 'succeeded', charge: 'ch_fixture' } })
    const first = executeRefund(input)
    const second = await executeRefund({ ...input, operationId: id2, amount: 30 })
    expect(second.status).toBe(409)
    release()
    expect((await first).status).toBe(200)
    expect(refs.create).toHaveBeenCalledTimes(1)
  })
  it('retains the reservation after a provider timeout with an unknown outcome', async () => {
    const op = ledger()
    refs.create.mockRejectedValue(new Error('Response lost after provider commit'))
    expect((await executeRefund(input)).status).toBe(503)
    expect(op.state).toBe('reserved')
    expect(refs.rpc.mock.calls.some(([name]) => name === 'nz_complete_refund')).toBe(false)
  })
  it('refuses an unresolved retry after the guaranteed provider key-retention window', async () => {
    ledger({ ...operation(), created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
    expect((await executeRefund(input)).status).toBe(409)
    expect(refs.create).not.toHaveBeenCalled()
  })
  it('retrieves a recorded refund after key expiry instead of creating another one', async () => {
    ledger({ ...operation(), provider_refund_id: 're_fixture', state: 'submitted', created_at: '2020-01-01T00:00:00Z' })
    expect((await executeRefund(input)).status).toBe(200)
    expect(refs.create).not.toHaveBeenCalled()
    expect(refs.retrieve).toHaveBeenCalledWith('re_fixture', {}, { stripeAccount: 'acct_fixture' })
  })
  it('does not mark a pending provider refund as settled', async () => {
    ledger()
    refs.create.mockResolvedValue({ id: 're_pending', amount: 2000, currency: 'usd', status: 'pending', charge: 'ch_fixture' })
    expect((await executeRefund(input)).status).toBe(503)
    expect(refs.charge).not.toHaveBeenCalled()
    expect(refs.rpc.mock.calls.some(([name]) => name === 'nz_complete_refund')).toBe(false)
  })
  it('rejects a charge from a different payment even if its amount matches', async () => {
    ledger()
    refs.charge.mockResolvedValue({ amount: 10000, currency: 'usd', amount_refunded: 2000, payment_intent: 'pi_other' })
    expect((await executeRefund(input)).status).toBe(503)
    expect(refs.rpc.mock.calls.some(([name]) => name === 'nz_complete_refund')).toBe(false)
  })
  it('does not count a different pending refund inside the charge aggregate', async () => {
    ledger()
    refs.charge.mockResolvedValue({ id: 'ch_fixture', amount: 10000, currency: 'usd', amount_refunded: 5000, payment_intent: 'pi_fixture' })
    refs.list.mockResolvedValue({ data: [
      { id: 're_fixture', amount: 2000, currency: 'usd', status: 'succeeded', charge: 'ch_fixture' },
      { id: 're_pending', amount: 3000, currency: 'usd', status: 'pending', charge: 'ch_fixture' },
    ], has_more: false })
    expect((await executeRefund(input)).status).toBe(503)
    expect(refs.rpc.mock.calls.some(([name]) => name === 'nz_complete_refund')).toBe(false)
  })
  it('reports a failed provider refund without recording settlement', async () => {
    ledger()
    refs.create.mockResolvedValue({ id: 're_failed', amount: 2000, currency: 'usd', status: 'failed', charge: 'ch_fixture' })
    const response = await executeRefund(input)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'refund_failed', operationId: id1 })
    expect(refs.rpc.mock.calls.some(([name]) => name === 'nz_complete_refund')).toBe(false)
  })
  it('fails before Stripe when reservation persistence is unavailable', async () => {
    refs.rpc.mockResolvedValue({ error: { code: '08006' } })
    expect((await executeRefund(input)).status).toBe(503)
    expect(refs.create).not.toHaveBeenCalled()
  })
})
