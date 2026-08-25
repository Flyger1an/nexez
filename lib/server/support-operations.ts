import 'server-only'

import { captureError } from '../observability'
import { buildSupportReplyEmail, hasEmailEnv, sendEmail } from '../email'
import { appUrl } from '../site'
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
  assignedTo: string | null
  firstRespondedAt: string | null
  lastRequesterMessageAt: string | null
  lastOperatorMessageAt: string | null
}

export type AdminSupportEvent = {
  id: string
  eventType: string
  fromStatus: string | null
  toStatus: string | null
  note: string | null
  actorId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type AdminSupportMessage = {
  id: string
  ticketId: string
  authorType: 'requester' | 'operator'
  authorId: string | null
  body: string
  channel: 'portal' | 'email'
  deliveryStatus: 'not_applicable' | 'pending' | 'sent' | 'failed'
  providerMessageId: string | null
  deliveryError: string | null
  sentAt: string | null
  createdAt: string
}

export type AdminSupportOperator = {
  id: string
  email: string | null
  label: string
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
  assigned_to: string | null
  first_responded_at: string | null
  last_requester_message_at: string | null
  last_operator_message_at: string | null
}

type EventRow = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  note: string | null
  actor_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type MessageRow = {
  id: string
  ticket_id: string
  author_type: 'requester' | 'operator'
  author_id: string | null
  body: string
  channel: 'portal' | 'email'
  delivery_status: 'not_applicable' | 'pending' | 'sent' | 'failed'
  provider_message_id: string | null
  delivery_error: string | null
  sent_at: string | null
  created_at: string
}

const TICKET_COLUMNS = 'id,owner_id,page_name,subject,category,priority,status,query,ai_response,reference,notification_status,notification_email_id,notified_at,resolved_at,created_at,updated_at,metadata,assigned_to,first_responded_at,last_requester_message_at,last_operator_message_at'
const MESSAGE_COLUMNS = 'id,ticket_id,author_type,author_id,body,channel,delivery_status,provider_message_id,delivery_error,sent_at,created_at'

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
  messages: AdminSupportMessage[]
} | null> {
  const admin = createAdminClient()
  const [
    { data: ticket, error: ticketError },
    { data: events, error: eventError },
    { data: messages, error: messageError },
  ] = await Promise.all([
    admin.from('support_tickets').select(TICKET_COLUMNS).eq('id', id).maybeSingle(),
    admin
      .from('support_ticket_events')
      .select('id,event_type,from_status,to_status,note,actor_id,metadata,created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('support_ticket_messages')
      .select(MESSAGE_COLUMNS)
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (ticketError) throw new Error(`Could not load support request: ${ticketError.message}`)
  if (!ticket) return null
  if (eventError) throw new Error(`Could not load support history: ${eventError.message}`)
  if (messageError) throw new Error(`Could not load support conversation: ${messageError.message}`)

  return {
    ticket: projectTicket(ticket as unknown as TicketRow),
    events: ((events ?? []) as unknown as EventRow[]).map((event) => ({
      id: event.id,
      eventType: event.event_type,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      note: event.note,
      actorId: event.actor_id,
      metadata: event.metadata ?? {},
      createdAt: event.created_at,
    })),
    messages: ((messages ?? []) as unknown as MessageRow[]).map(projectMessage),
  }
}

export async function getAdminSupportOperators(): Promise<AdminSupportOperator[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_admins')
    .select('user_id,note')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Could not load support operators: ${error.message}`)

  const operators = await Promise.all(((data ?? []) as Array<{ user_id: string; note: string | null }>).map(async (row) => {
    const { data: identity } = await admin.auth.admin.getUserById(row.user_id)
    const email = identity.user?.email ?? null
    return {
      id: row.user_id,
      email,
      label: email ?? row.note ?? `Admin ${row.user_id.slice(0, 8)}`,
    }
  }))

  return operators.sort((a, b) => a.label.localeCompare(b.label))
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

export async function recordSupportTicketAssignment(input: {
  ticketId: string
  actorId: string
  assignedTo: string | null
}) {
  const admin = createAdminClient()
  const { error } = await admin.rpc('assign_support_ticket', {
    p_ticket_id: input.ticketId,
    p_actor_id: input.actorId,
    p_assigned_to: input.assignedTo,
  })
  if (error) {
    if (error.code === '22023' && /no change/i.test(error.message)) {
      throw new Error('Choose a different assignee.')
    }
    throw new Error(`Could not assign support request: ${error.message}`)
  }
}

export async function sendAdminSupportReply(input: {
  ticketId: string
  actorId: string
  body: string
  idempotencyToken: string
}): Promise<{ messageId: string; emailId: string }> {
  if (!hasEmailEnv()) throw new Error('Support email delivery is not configured.')

  const admin = createAdminClient()
  const { data: ticketData, error: ticketError } = await admin
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('id', input.ticketId)
    .maybeSingle()

  if (ticketError) throw new Error(`Could not load support request: ${ticketError.message}`)
  if (!ticketData) throw new Error('Support request not found.')

  const ticket = projectTicket(ticketData as unknown as TicketRow)
  if (!ticket.requesterEmail) throw new Error('Requester email is unavailable.')
  if (ticket.status === 'closed') throw new Error('Reopen this request before sending a reply.')

  const idempotencyKey = `support-reply/${input.ticketId}/${input.idempotencyToken}`
  let message = await findSupportReply(admin, idempotencyKey)

  if (message) {
    if (message.ticket_id !== input.ticketId || message.author_id !== input.actorId || message.body !== input.body) {
      throw new Error('Reply submission key does not match this message.')
    }
    if (message.delivery_status === 'sent' && message.provider_message_id) {
      return { messageId: message.id, emailId: message.provider_message_id }
    }
  } else {
    const { data, error } = await admin
      .from('support_ticket_messages')
      .insert({
        ticket_id: input.ticketId,
        author_type: 'operator',
        author_id: input.actorId,
        body: input.body,
        channel: 'email',
        delivery_status: 'pending',
        idempotency_key: idempotencyKey,
      })
      .select(MESSAGE_COLUMNS)
      .single()

    if (error) {
      if (error.code !== '23505') throw new Error(`Could not save support reply: ${error.message}`)
      message = await findSupportReply(admin, idempotencyKey)
      if (!message) throw new Error('Could not recover the saved support reply.')
    } else {
      message = data as unknown as MessageRow
    }
  }

  const built = await buildSupportReplyEmail({
    ticketId: ticket.id,
    ticketSubject: ticket.subject,
    replyBody: message.body,
    requestUrl: appUrl(`/support/requests/${ticket.id}`),
  })
  const delivery = await sendEmail({
    to: ticket.requesterEmail,
    subject: built.subject,
    html: built.html,
    text: built.text,
    idempotencyKey: `support-reply/${message.id}`,
    tags: [
      { name: 'stream', value: 'support' },
      { name: 'kind', value: 'operator-reply' },
    ],
  })

  const providerMessageId = delivery.ok ? delivery.id ?? null : null
  const { error: completionError } = await admin.rpc('complete_support_reply', {
    p_message_id: message.id,
    p_actor_id: input.actorId,
    p_succeeded: delivery.ok && Boolean(providerMessageId),
    p_provider_message_id: providerMessageId,
    p_error: delivery.ok ? 'Email provider did not return a message id.' : delivery.error ?? 'Email provider did not accept the reply.',
  })

  if (completionError) {
    captureError(completionError, {
      area: 'support-reply-completion',
      ticketId: input.ticketId,
      messageId: message.id,
      providerAccepted: delivery.ok,
    })
    throw new Error('Could not finalize the support reply delivery record. Retry with the same message.')
  }

  if (!delivery.ok || !providerMessageId) {
    throw new Error('Reply saved, but the email provider did not accept it. It remains marked as failed.')
  }

  return { messageId: message.id, emailId: providerMessageId }
}

async function findSupportReply(
  admin: ReturnType<typeof createAdminClient>,
  idempotencyKey: string,
): Promise<MessageRow | null> {
  const { data, error } = await admin
    .from('support_ticket_messages')
    .select(MESSAGE_COLUMNS)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (error) throw new Error(`Could not check support reply state: ${error.message}`)
  return data as unknown as MessageRow | null
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
    assignedTo: row.assigned_to,
    firstRespondedAt: row.first_responded_at,
    lastRequesterMessageAt: row.last_requester_message_at,
    lastOperatorMessageAt: row.last_operator_message_at,
  }
}

function projectMessage(row: MessageRow): AdminSupportMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorType: row.author_type,
    authorId: row.author_id,
    body: row.body,
    channel: row.channel,
    deliveryStatus: row.delivery_status,
    providerMessageId: row.provider_message_id,
    deliveryError: row.delivery_error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }
}
