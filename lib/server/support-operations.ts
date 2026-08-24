import 'server-only'

import { createAdminClient } from '../../utils/supabase/admin'

export const SUPPORT_STATUSES = ['open', 'in_review', 'waiting_on_user', 'resolved', 'closed'] as const
export type SupportStatus = (typeof SUPPORT_STATUSES)[number]

export type AdminSupportTicket = {
  id: string
  ownerId: string
  requesterEmail: string | null
  pageName: string | null
  subject: string
  category: string
  priority: string
  status: SupportStatus
  query: string
  aiResponse: string | null
  reference: string | null
  notificationStatus: 'pending' | 'sent' | 'failed'
  notificationEmailId: string | null
  notifiedAt: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  supportTier: string | null
}

export type AdminSupportEvent = {
  id: string
  eventType: string
  fromStatus: string | null
  toStatus: string | null
  note: string | null
  actorId: string | null
  createdAt: string
}

type TicketRow = {
  id: string
  owner_id: string
  page_name: string | null
  subject: string
  category: string
  priority: string
  status: SupportStatus
  query: string
  ai_response: string | null
  reference: string | null
  notification_status: 'pending' | 'sent' | 'failed'
  notification_email_id: string | null
  notified_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown> | null
}

type EventRow = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  note: string | null
  actor_id: string | null
  created_at: string
}

const TICKET_COLUMNS = 'id,owner_id,page_name,subject,category,priority,status,query,ai_response,reference,notification_status,notification_email_id,notified_at,resolved_at,created_at,updated_at,metadata'

export async function getAdminSupportQueue(): Promise<AdminSupportTicket[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Could not load support requests: ${error.message}`)
  return ((data ?? []) as unknown as TicketRow[]).map(projectTicket)
}

export async function getAdminSupportTicket(id: string): Promise<{
  ticket: AdminSupportTicket
  events: AdminSupportEvent[]
} | null> {
  const admin = createAdminClient()
  const [{ data: ticket, error: ticketError }, { data: events, error: eventError }] = await Promise.all([
    admin.from('support_tickets').select(TICKET_COLUMNS).eq('id', id).maybeSingle(),
    admin
      .from('support_ticket_events')
      .select('id,event_type,from_status,to_status,note,actor_id,created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (ticketError) throw new Error(`Could not load support request: ${ticketError.message}`)
  if (!ticket) return null
  if (eventError) throw new Error(`Could not load support history: ${eventError.message}`)

  return {
    ticket: projectTicket(ticket as unknown as TicketRow),
    events: ((events ?? []) as unknown as EventRow[]).map((event) => ({
      id: event.id,
      eventType: event.event_type,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      note: event.note,
      actorId: event.actor_id,
      createdAt: event.created_at,
    })),
  }
}

export async function recordSupportTicketUpdate(input: {
  ticketId: string
  actorId: string
  status: SupportStatus
  note: string | null
}) {
  const admin = createAdminClient()
  const { error } = await admin.rpc('transition_support_ticket', {
    p_ticket_id: input.ticketId,
    p_actor_id: input.actorId,
    p_status: input.status,
    p_note: input.note,
  })
  if (error) {
    if (error.code === '22023' && /no change/i.test(error.message)) {
      throw new Error('Choose a new status or add an operator note.')
    }
    throw new Error(`Could not update support request: ${error.message}`)
  }
}

function projectTicket(row: TicketRow): AdminSupportTicket {
  const metadata = row.metadata ?? {}
  return {
    id: row.id,
    ownerId: row.owner_id,
    requesterEmail: typeof metadata.user_email === 'string' ? metadata.user_email : null,
    pageName: row.page_name,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    query: row.query,
    aiResponse: row.ai_response,
    reference: row.reference,
    notificationStatus: row.notification_status,
    notificationEmailId: row.notification_email_id,
    notifiedAt: row.notified_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supportTier: typeof metadata.support_service_tier_at_submission === 'string'
      ? metadata.support_service_tier_at_submission
      : null,
  }
}
