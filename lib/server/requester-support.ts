import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupportStatus } from './support-operations'

export type RequesterSupportTicket = {
  id: string
  subject: string
  category: string
  priority: string
  status: SupportStatus
  query: string
  pageName: string | null
  reference: string | null
  firstRespondedAt: string | null
  createdAt: string
  updatedAt: string
}

export type RequesterSupportMessage = {
  id: string
  authorType: 'requester' | 'operator'
  body: string
  deliveryStatus: 'not_applicable' | 'sent'
  sentAt: string | null
  createdAt: string
}

type TicketRow = {
  id: string
  subject: string
  category: string
  priority: string
  status: SupportStatus
  query: string
  page_name: string | null
  reference: string | null
  first_responded_at: string | null
  created_at: string
  updated_at: string
}

type MessageRow = {
  id: string
  author_type: 'requester' | 'operator'
  body: string
  delivery_status: 'not_applicable' | 'sent'
  sent_at: string | null
  created_at: string
}

const TICKET_COLUMNS = 'id,subject,category,priority,status,query,page_name,reference,first_responded_at,created_at,updated_at'
const MESSAGE_COLUMNS = 'id,author_type,body,delivery_status,sent_at,created_at'

export async function getRequesterSupportTickets(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 20,
): Promise<RequesterSupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Could not load your support requests: ${error.message}`)
  return ((data ?? []) as unknown as TicketRow[]).map(projectTicket)
}

export async function getRequesterSupportTicket(
  supabase: SupabaseClient,
  ownerId: string,
  ticketId: string,
): Promise<{ ticket: RequesterSupportTicket; messages: RequesterSupportMessage[] } | null> {
  const [
    { data: ticket, error: ticketError },
    { data: messages, error: messageError },
  ] = await Promise.all([
    supabase
      .from('support_tickets')
      .select(TICKET_COLUMNS)
      .eq('id', ticketId)
      .eq('owner_id', ownerId)
      .maybeSingle(),
    supabase
      .from('support_ticket_messages')
      .select(MESSAGE_COLUMNS)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  ])

  if (ticketError) throw new Error(`Could not load your support request: ${ticketError.message}`)
  if (!ticket) return null
  if (messageError) throw new Error(`Could not load your support conversation: ${messageError.message}`)

  return {
    ticket: projectTicket(ticket as unknown as TicketRow),
    messages: ((messages ?? []) as unknown as MessageRow[]).map((message) => ({
      id: message.id,
      authorType: message.author_type,
      body: message.body,
      deliveryStatus: message.delivery_status,
      sentAt: message.sent_at,
      createdAt: message.created_at,
    })),
  }
}

function projectTicket(row: TicketRow): RequesterSupportTicket {
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    query: row.query,
    pageName: row.page_name,
    reference: row.reference,
    firstRespondedAt: row.first_responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
