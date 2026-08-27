import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const refs = vi.hoisted(() => ({ createAdminClient: vi.fn(), sendEmail: vi.fn() }))
vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../email', () => ({
  hasEmailEnv: vi.fn(() => true),
  sendEmail: refs.sendEmail,
}))

import { sendOnceSystemEmail } from './system-email'

const options = {
  ownerId: 'owner-1',
  kind: 'welcome',
  to: 'owner@example.com',
  build: vi.fn(async () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })),
}

describe('sendOnceSystemEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.sendEmail.mockResolvedValue({ ok: true, id: 'resend-1' })
  })

  it('claims, sends with a deterministic provider key, and records delivery', async () => {
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op === 'insert') return { data: { owner_id: 'owner-1' }, error: null }
      if (ctx.op === 'update') writes.push({ ...ctx })
      return { data: null, error: null }
    }))

    await expect(sendOnceSystemEmail(options)).resolves.toEqual({ sent: true })
    expect(refs.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      idempotencyKey: expect.stringMatching(/^system-[0-9a-f]{64}$/),
    }))
    expect(writes.at(-1)?.payload).toMatchObject({ delivered_at: expect.any(String), provider_message_id: 'resend-1' })
  })

  it('does not rebuild or resend a delivery already recorded in the ledger', async () => {
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op === 'insert') return { data: null, error: { code: '23505' } }
      return {
        data: {
          owner_id: 'owner-1', kind: 'welcome', delivery_claimed_at: null,
          delivered_at: '2026-08-27T12:00:00Z', abandoned_at: null, delivery_attempts: 1,
        },
        error: null,
      }
    }))

    await expect(sendOnceSystemEmail(options)).resolves.toMatchObject({ sent: false, skipped: true, reason: 'already_sent' })
    expect(options.build).not.toHaveBeenCalled()
    expect(refs.sendEmail).not.toHaveBeenCalled()
  })

  it('releases a failed claim so a later invocation can retry it', async () => {
    const writes: QueryContext[] = []
    refs.sendEmail.mockResolvedValue({ ok: false, error: 'provider unavailable' })
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op === 'insert') return { data: { owner_id: 'owner-1' }, error: null }
      if (ctx.op === 'update') writes.push({ ...ctx })
      return { data: null, error: null }
    }))

    await expect(sendOnceSystemEmail(options)).resolves.toMatchObject({ sent: false, reason: 'provider unavailable' })
    expect(writes.at(-1)?.payload).toMatchObject({ delivery_claimed_at: null, last_error: 'provider unavailable' })
  })
})
