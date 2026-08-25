import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../../../test/supabase-mock'

const state = vi.hoisted(() => ({
  user: { id: 'owner-1', email: 'owner@example.com' } as any,
  handler: ((_: unknown) => ({ data: null, error: null })) as (ctx: QueryContext) => { data?: unknown; error?: unknown },
  deliver: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}))
vi.mock('../../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../../lib/server/support-email', () => ({
  deliverSupportRequesterReplyNotification: state.deliver,
}))
vi.mock('../../../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))

import { POST } from './route'
import { createClient } from '../../../../../../utils/supabase/server'

const TICKET_ID = '10000000-0000-4000-8000-000000000001'
const MESSAGE_ID = '20000000-0000-4000-8000-000000000001'
const CLIENT_ID = '30000000-0000-4000-8000-000000000001'

function request(body: unknown) {
  return new Request(`https://app.nexez.ai/api/support/tickets/${TICKET_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function context(id = TICKET_ID) {
  return { params: Promise.resolve({ id }) } as never
}

describe('requester support replies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'owner-1', email: 'owner@example.com' }
    state.deliver.mockResolvedValue({ status: 'sent', emailId: 'email-1' })
    vi.mocked(createClient).mockImplementation(() => createSupabaseMock((ctx) => state.handler(ctx), { user: state.user }) as never)
  })

  it('requires an authenticated requester', async () => {
    state.user = null
    vi.mocked(createClient).mockImplementation(() => createSupabaseMock(() => ({ data: null, error: null }), { user: null }) as never)

    expect((await POST(request({ body: 'Still broken', clientMessageId: CLIENT_ID }), context())).status).toBe(401)
  })

  it('appends only safe requester fields and notifies the support inbox', async () => {
    const calls: QueryContext[] = []
    state.handler = (ctx) => {
      calls.push({ ...ctx, calls: [...ctx.calls] })
      if (ctx.table === 'support_tickets') {
        return { data: { id: TICKET_ID, subject: 'Checkout incident', status: 'open' }, error: null }
      }
      if (ctx.table === 'support_ticket_messages' && ctx.op === 'insert') {
        return { data: { id: MESSAGE_ID, body: 'The issue still happens after signing in again.', created_at: '2026-08-24T12:00:00.000Z' }, error: null }
      }
      return { data: null, error: null }
    }

    const response = await POST(request({
      body: '  The issue still happens after signing in again.  ',
      clientMessageId: CLIENT_ID,
      authorType: 'operator',
      deliveryStatus: 'sent',
    }), context())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      messageId: MESSAGE_ID,
      notificationStatus: 'sent',
    })
    expect(calls).toContainEqual(expect.objectContaining({
      table: 'support_ticket_messages',
      op: 'insert',
      payload: {
        ticket_id: TICKET_ID,
        body: 'The issue still happens after signing in again.',
        client_message_id: CLIENT_ID,
      },
    }))
    expect(state.deliver).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      messageId: MESSAGE_ID,
      requesterEmail: 'owner@example.com',
      ticketSubject: 'Checkout incident',
      replyBody: 'The issue still happens after signing in again.',
    })
  })

  it('does not accept replies to a closed request', async () => {
    state.handler = (ctx) => ctx.table === 'support_tickets'
      ? { data: { id: TICKET_ID, subject: 'Closed request', status: 'closed' }, error: null }
      : { data: null, error: null }

    const response = await POST(request({ body: 'Please reopen this.', clientMessageId: CLIENT_ID }), context())

    expect(response.status).toBe(409)
    expect(state.deliver).not.toHaveBeenCalled()
  })

  it('returns not found when the request is outside the requester account', async () => {
    state.handler = () => ({ data: null, error: null })

    expect((await POST(request({ body: 'Cross-account reply.', clientMessageId: CLIENT_ID }), context())).status).toBe(404)
  })

  it('rejects an idempotency token reused with different reply text', async () => {
    state.handler = (ctx) => {
      if (ctx.table === 'support_tickets') {
        return { data: { id: TICKET_ID, subject: 'Checkout incident', status: 'open' }, error: null }
      }
      if (ctx.table === 'support_ticket_messages' && ctx.op === 'insert') {
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      if (ctx.table === 'support_ticket_messages') {
        return {
          data: {
            id: MESSAGE_ID,
            body: 'The original saved reply.',
            created_at: '2026-08-24T12:00:00.000Z',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const response = await POST(request({ body: 'Different reply text.', clientMessageId: CLIENT_ID }), context())

    expect(response.status).toBe(409)
    expect(state.deliver).not.toHaveBeenCalled()
  })
})
