import { describe, expect, it } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'
import { getRequesterSupportTicket, getRequesterSupportTickets } from './requester-support'

const ticketRow = {
  id: 'ticket-1',
  subject: 'Checkout incident',
  category: 'transaction',
  priority: 'urgent',
  status: 'open',
  query: 'Checkout is returning an unexpected error.',
  page_name: 'Axle Plumbing Co.',
  reference: 'order-1',
  first_responded_at: null,
  created_at: '2026-08-24T12:00:00.000Z',
  updated_at: '2026-08-24T12:01:00.000Z',
}

describe('requester support data', () => {
  it('loads only the requested owner queue through the RLS client', async () => {
    const client = createSupabaseMock((ctx) => {
      expect(ctx.table).toBe('support_tickets')
      expect(ctx.eqs.owner_id).toBe('owner-1')
      return { data: [ticketRow], error: null }
    })

    await expect(getRequesterSupportTickets(client as never, 'owner-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'ticket-1',
        subject: 'Checkout incident',
        pageName: 'Axle Plumbing Co.',
      }),
    ])
  })

  it('loads the requester-safe conversation without internal event history', async () => {
    const client = createSupabaseMock((ctx) => {
      if (ctx.table === 'support_tickets') {
        expect(ctx.eqs).toMatchObject({ id: 'ticket-1', owner_id: 'owner-1' })
        return { data: ticketRow, error: null }
      }
      expect(ctx.table).toBe('support_ticket_messages')
      expect(ctx.eqs.ticket_id).toBe('ticket-1')
      return {
        data: [{
          id: 'message-1',
          author_type: 'operator',
          body: 'We are reviewing the checkout path now.',
          delivery_status: 'sent',
          sent_at: '2026-08-24T12:05:00.000Z',
          created_at: '2026-08-24T12:04:00.000Z',
        }],
        error: null,
      }
    })

    await expect(getRequesterSupportTicket(client as never, 'owner-1', 'ticket-1')).resolves.toMatchObject({
      ticket: { id: 'ticket-1' },
      messages: [{
        id: 'message-1',
        authorType: 'operator',
        deliveryStatus: 'sent',
      }],
    })
  })
})
