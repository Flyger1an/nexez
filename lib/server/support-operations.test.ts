import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const state = vi.hoisted(() => ({
  handler: ((_: unknown) => ({ data: null, error: null })) as (ctx: QueryContext) => { data?: unknown; error?: unknown },
}))

vi.mock('../../utils/supabase/admin', () => ({
  createAdminClient: () => createSupabaseMock((ctx) => state.handler(ctx)),
}))

import {
  getAdminSupportQueue,
  getAdminSupportTicket,
  recordSupportTicketUpdate,
} from './support-operations'

const ticketRow = {
  id: 'ticket-1',
  owner_id: 'owner-1',
  page_name: 'Axle Plumbing Co.',
  subject: 'Checkout incident',
  category: 'transaction',
  priority: 'urgent',
  status: 'open',
  query: 'Checkout is returning an unexpected error.',
  ai_response: null,
  reference: 'order-1',
  notification_status: 'sent',
  notification_email_id: 'email-1',
  notified_at: '2026-08-24T12:01:00.000Z',
  resolved_at: null,
  created_at: '2026-08-24T12:00:00.000Z',
  updated_at: '2026-08-24T12:01:00.000Z',
  metadata: {
    user_email: 'owner@example.com',
    support_service_tier_at_submission: 'priority',
  },
}

describe('admin support operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('projects requester and delivery evidence for the protected queue', async () => {
    state.handler = () => ({ data: [ticketRow], error: null })

    await expect(getAdminSupportQueue()).resolves.toEqual([
      expect.objectContaining({
        id: 'ticket-1',
        requesterEmail: 'owner@example.com',
        supportTier: 'priority',
        notificationStatus: 'sent',
      }),
    ])
  })

  it('loads a ticket and its append-only activity', async () => {
    state.handler = (ctx) => ctx.table === 'support_tickets'
      ? { data: ticketRow, error: null }
      : {
          data: [{
            id: 'event-1',
            event_type: 'email_sent',
            from_status: null,
            to_status: null,
            note: null,
            actor_id: null,
            created_at: '2026-08-24T12:01:00.000Z',
          }],
          error: null,
        }

    await expect(getAdminSupportTicket('ticket-1')).resolves.toMatchObject({
      ticket: { id: 'ticket-1' },
      events: [{ id: 'event-1', eventType: 'email_sent' }],
    })
  })

  it('changes workflow state and records the operator decision', async () => {
    const calls: QueryContext[] = []
    state.handler = (ctx) => {
      calls.push({ ...ctx, calls: [...ctx.calls] })
      return { data: null, error: null }
    }

    await recordSupportTicketUpdate({
      ticketId: 'ticket-1',
      actorId: 'admin-1',
      status: 'in_review',
      note: 'Reproducing the checkout issue.',
    })

    expect(calls).toContainEqual(expect.objectContaining({
      table: 'rpc:transition_support_ticket',
      payload: {
        p_ticket_id: 'ticket-1',
        p_actor_id: 'admin-1',
        p_status: 'in_review',
        p_note: 'Reproducing the checkout issue.',
      },
    }))
  })

  it('rejects a no-op that would create meaningless history', async () => {
    state.handler = () => ({ data: null, error: { code: '22023', message: 'support update has no change' } })

    await expect(recordSupportTicketUpdate({
      ticketId: 'ticket-1',
      actorId: 'admin-1',
      status: 'open',
      note: null,
    })).rejects.toThrow('Choose a new status or add an operator note.')
  })
})
