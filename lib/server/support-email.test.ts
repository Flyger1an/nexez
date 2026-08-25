import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  buildSupportTicketEmail: vi.fn(),
  buildSupportRequesterReplyEmail: vi.fn(),
  ticketUpdate: vi.fn(),
  eventInsert: vi.fn(),
  captureError: vi.fn(),
}))

vi.mock('../email', () => ({
  hasEmailEnv: () => true,
  buildSupportTicketEmail: mocks.buildSupportTicketEmail,
  buildSupportRequesterReplyEmail: mocks.buildSupportRequesterReplyEmail,
  sendEmail: mocks.sendEmail,
}))
vi.mock('../observability', () => ({ captureError: mocks.captureError }))
vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => true,
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'support_tickets') {
        return {
          update: (payload: unknown) => ({
            eq: async (column: string, value: string) => mocks.ticketUpdate(payload, column, value),
          }),
        }
      }
      return { insert: (payload: unknown) => mocks.eventInsert(payload) }
    },
  }),
}))

import {
  deliverSupportRequesterReplyNotification,
  deliverSupportTicketNotification,
  NEXEZ_SUPPORT_INBOX,
} from './support-email'

const ticket = {
  id: 'ticket-1',
  requesterEmail: 'owner@example.com',
  subject: 'Checkout incident',
  category: 'transaction',
  priority: 'urgent',
  targetName: 'Axle Plumbing Co.',
  query: 'Checkout is returning an unexpected error.',
  reference: 'order-1',
  supportTier: 'priority',
}

describe('support ticket email delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildSupportTicketEmail.mockResolvedValue({
      subject: '[Support urgent] Checkout incident',
      html: '<p>Ticket</p>',
      text: 'Ticket',
    })
    mocks.buildSupportRequesterReplyEmail.mockResolvedValue({
      subject: '[Support reply] Checkout incident',
      html: '<p>Reply</p>',
      text: 'Reply',
    })
    mocks.ticketUpdate.mockResolvedValue({ error: null })
    mocks.eventInsert.mockResolvedValue({ error: null })
  })

  it('delivers to the support inbox with a requester reply address and records success', async () => {
    mocks.sendEmail.mockResolvedValue({ ok: true, id: 'email-1' })

    await expect(deliverSupportTicketNotification(ticket)).resolves.toEqual({
      status: 'sent',
      emailId: 'email-1',
    })

    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: NEXEZ_SUPPORT_INBOX,
      replyTo: 'owner@example.com',
      idempotencyKey: 'support-ticket/ticket-1',
      tags: [
        { name: 'stream', value: 'support' },
        { name: 'priority', value: 'urgent' },
      ],
    }))
    expect(mocks.ticketUpdate).toHaveBeenCalledWith(expect.objectContaining({
      notification_status: 'sent',
      notification_email_id: 'email-1',
    }), 'id', 'ticket-1')
    expect(mocks.eventInsert).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: 'ticket-1',
      event_type: 'email_sent',
    }))
  })

  it('keeps the ticket and records a failed inbox delivery', async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, error: 'provider unavailable' })

    await expect(deliverSupportTicketNotification(ticket)).resolves.toEqual({ status: 'failed' })
    expect(mocks.ticketUpdate).toHaveBeenCalledWith(expect.objectContaining({
      notification_status: 'failed',
      notification_email_id: null,
      notified_at: null,
    }), 'id', 'ticket-1')
    expect(mocks.eventInsert).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'email_failed' }))
  })

  it('notifies the support inbox when a requester replies in the portal', async () => {
    mocks.sendEmail.mockResolvedValue({ ok: true, id: 'email-reply-1' })

    await expect(deliverSupportRequesterReplyNotification({
      ticketId: 'ticket-1',
      messageId: 'message-1',
      requesterEmail: 'owner@example.com',
      ticketSubject: 'Checkout incident',
      replyBody: 'The issue still happens.',
    })).resolves.toEqual({ status: 'sent', emailId: 'email-reply-1' })

    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: NEXEZ_SUPPORT_INBOX,
      replyTo: 'owner@example.com',
      idempotencyKey: 'support-requester-reply/message-1',
    }))
    expect(mocks.eventInsert).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: 'ticket-1',
      event_type: 'email_sent',
      metadata: expect.objectContaining({ kind: 'requester_reply', message_id: 'message-1' }),
    }))
  })
})
