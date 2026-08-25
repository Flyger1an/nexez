import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const state = vi.hoisted(() => ({
  handler: ((_: unknown) => ({ data: null, error: null })) as (ctx: QueryContext) => { data?: unknown; error?: unknown },
  getUserById: vi.fn(),
  sendEmail: vi.fn(),
  buildSupportReplyEmail: vi.fn(),
  captureError: vi.fn(),
}))

vi.mock('../../utils/supabase/admin', () => ({
  createAdminClient: () => {
    const client = createSupabaseMock((ctx) => state.handler(ctx))
    return {
      ...client,
      auth: {
        ...client.auth,
        admin: { getUserById: state.getUserById },
      },
    }
  },
}))
vi.mock('../email', () => ({
  hasEmailEnv: () => true,
  sendEmail: state.sendEmail,
  buildSupportReplyEmail: state.buildSupportReplyEmail,
}))
vi.mock('../observability', () => ({ captureError: state.captureError }))

import {
  getAdminSupportQueue,
  getAdminSupportOperators,
  getAdminSupportTicket,
  recordSupportTicketAssignment,
  recordSupportTicketUpdate,
  sendAdminSupportReply,
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
  assigned_to: null,
  first_responded_at: null,
  last_requester_message_at: null,
  last_operator_message_at: null,
}

describe('admin support operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.buildSupportReplyEmail.mockResolvedValue({
      subject: 'Re: Checkout incident [ticket-1]',
      html: '<p>Reply</p>',
      text: 'Reply',
    })
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
    state.handler = (ctx) => {
      if (ctx.table === 'support_tickets') return { data: ticketRow, error: null }
      if (ctx.table === 'support_ticket_messages') {
        return {
          data: [{
            id: 'message-1',
            ticket_id: 'ticket-1',
            author_type: 'requester',
            author_id: 'owner-1',
            body: 'The issue still happens.',
            channel: 'portal',
            delivery_status: 'not_applicable',
            provider_message_id: null,
            delivery_error: null,
            sent_at: null,
            created_at: '2026-08-24T12:02:00.000Z',
          }],
          error: null,
        }
      }
      return {
          data: [{
            id: 'event-1',
            event_type: 'email_sent',
            from_status: null,
            to_status: null,
            note: null,
            actor_id: null,
            metadata: {},
            created_at: '2026-08-24T12:01:00.000Z',
          }],
          error: null,
        }
    }

    await expect(getAdminSupportTicket('ticket-1')).resolves.toMatchObject({
      ticket: { id: 'ticket-1' },
      events: [{ id: 'event-1', eventType: 'email_sent' }],
      messages: [{ id: 'message-1', body: 'The issue still happens.' }],
    })
  })

  it('resolves human-readable operator identities for assignment controls', async () => {
    state.handler = (ctx) => ctx.table === 'platform_admins'
      ? { data: [{ user_id: 'admin-1', note: 'Support lead' }], error: null }
      : { data: null, error: null }
    state.getUserById.mockResolvedValue({ data: { user: { email: 'admin@nexez.ai' } }, error: null })

    await expect(getAdminSupportOperators()).resolves.toEqual([{
      id: 'admin-1',
      email: 'admin@nexez.ai',
      label: 'admin@nexez.ai',
    }])
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

  it('assigns support through the audited database function', async () => {
    const calls: QueryContext[] = []
    state.handler = (ctx) => {
      calls.push({ ...ctx, calls: [...ctx.calls] })
      return { data: null, error: null }
    }

    await recordSupportTicketAssignment({
      ticketId: 'ticket-1',
      actorId: 'admin-1',
      assignedTo: 'admin-2',
    })

    expect(calls).toContainEqual(expect.objectContaining({
      table: 'rpc:assign_support_ticket',
      payload: {
        p_ticket_id: 'ticket-1',
        p_actor_id: 'admin-1',
        p_assigned_to: 'admin-2',
      },
    }))
  })

  it('marks a reply sent only after the email provider accepts it', async () => {
    const calls: QueryContext[] = []
    const messageRow = {
      id: 'message-1',
      ticket_id: 'ticket-1',
      author_type: 'operator',
      author_id: 'admin-1',
      body: 'We are reviewing the checkout path now.',
      channel: 'email',
      delivery_status: 'pending',
      provider_message_id: null,
      delivery_error: null,
      sent_at: null,
      created_at: '2026-08-24T12:02:00.000Z',
    }
    state.handler = (ctx) => {
      calls.push({ ...ctx, calls: [...ctx.calls] })
      if (ctx.table === 'support_tickets') return { data: ticketRow, error: null }
      if (ctx.table === 'support_ticket_messages' && ctx.op === 'select') return { data: null, error: null }
      if (ctx.table === 'support_ticket_messages' && ctx.op === 'insert') return { data: messageRow, error: null }
      return { data: null, error: null }
    }
    state.sendEmail.mockResolvedValue({ ok: true, id: 'resend-1' })

    await expect(sendAdminSupportReply({
      ticketId: 'ticket-1',
      actorId: 'admin-1',
      body: messageRow.body,
      idempotencyToken: '00000000-0000-4000-8000-000000000001',
    })).resolves.toEqual({ messageId: 'message-1', emailId: 'resend-1' })

    expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      idempotencyKey: 'support-reply/message-1',
    }))
    expect(calls).toContainEqual(expect.objectContaining({
      table: 'rpc:complete_support_reply',
      payload: expect.objectContaining({
        p_message_id: 'message-1',
        p_succeeded: true,
        p_provider_message_id: 'resend-1',
      }),
    }))
  })

  it('persists a failed delivery state without claiming a reply was sent', async () => {
    const calls: QueryContext[] = []
    const messageRow = {
      id: 'message-2',
      ticket_id: 'ticket-1',
      author_type: 'operator',
      author_id: 'admin-1',
      body: 'We are checking this now.',
      channel: 'email',
      delivery_status: 'pending',
      provider_message_id: null,
      delivery_error: null,
      sent_at: null,
      created_at: '2026-08-24T12:02:00.000Z',
    }
    state.handler = (ctx) => {
      calls.push({ ...ctx, calls: [...ctx.calls] })
      if (ctx.table === 'support_tickets') return { data: ticketRow, error: null }
      if (ctx.table === 'support_ticket_messages' && ctx.op === 'select') return { data: null, error: null }
      if (ctx.table === 'support_ticket_messages' && ctx.op === 'insert') return { data: messageRow, error: null }
      return { data: null, error: null }
    }
    state.sendEmail.mockResolvedValue({ ok: false, error: 'provider unavailable' })

    await expect(sendAdminSupportReply({
      ticketId: 'ticket-1',
      actorId: 'admin-1',
      body: messageRow.body,
      idempotencyToken: '00000000-0000-4000-8000-000000000002',
    })).rejects.toThrow('remains marked as failed')

    expect(calls).toContainEqual(expect.objectContaining({
      table: 'rpc:complete_support_reply',
      payload: expect.objectContaining({
        p_succeeded: false,
        p_provider_message_id: null,
        p_error: 'provider unavailable',
      }),
    }))
  })
})
