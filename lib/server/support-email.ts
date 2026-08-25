import 'server-only'

import { captureError } from '../observability'
import {
  buildSupportRequesterReplyEmail,
  buildSupportTicketEmail,
  hasEmailEnv,
  sendEmail,
} from '../email'
import { adminUrl } from '../site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

export const NEXEZ_SUPPORT_INBOX = 'support@nexez.ai'

export type SupportTicketNotification = {
  id: string
  requesterEmail: string
  subject: string
  category: string
  priority: string
  targetName: string
  query: string
  reference?: string | null
  supportTier: string
}

export type SupportTicketDeliveryResult = {
  status: 'sent' | 'failed'
  emailId?: string
}

export async function deliverSupportTicketNotification(
  ticket: SupportTicketNotification,
): Promise<SupportTicketDeliveryResult> {
  let delivery: SupportTicketDeliveryResult = { status: 'failed' }

  if (hasEmailEnv()) {
    const message = await buildSupportTicketEmail({
      requesterEmail: ticket.requesterEmail,
      ticketId: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      targetName: ticket.targetName,
      query: ticket.query,
      reference: ticket.reference,
      supportTier: ticket.supportTier,
      adminUrl: adminUrl(`/admin/support/${ticket.id}`),
    })
    const result = await sendEmail({
      to: NEXEZ_SUPPORT_INBOX,
      replyTo: ticket.requesterEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
      idempotencyKey: `support-ticket/${ticket.id}`,
      tags: [
        { name: 'stream', value: 'support' },
        { name: 'priority', value: ticket.priority },
      ],
    })
    delivery = result.ok
      ? { status: 'sent', ...(result.id ? { emailId: result.id } : {}) }
      : { status: 'failed' }
  }

  if (!hasSupabaseAdminEnv()) return delivery

  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .from('support_tickets')
      .update({
        notification_status: delivery.status,
        notification_email_id: delivery.emailId ?? null,
        notified_at: delivery.status === 'sent' ? now : null,
      })
      .eq('id', ticket.id)

    if (updateError) throw updateError

    const { error: eventError } = await admin.from('support_ticket_events').insert({
      ticket_id: ticket.id,
      event_type: delivery.status === 'sent' ? 'email_sent' : 'email_failed',
      metadata: delivery.emailId ? { email_id: delivery.emailId } : {},
    })
    if (eventError) throw eventError
  } catch (error) {
    captureError(error, {
      area: 'support-ticket-delivery-state',
      ticketId: ticket.id,
      deliveryStatus: delivery.status,
    })
  }

  return delivery
}

export async function deliverSupportRequesterReplyNotification(input: {
  ticketId: string
  messageId: string
  requesterEmail: string
  ticketSubject: string
  replyBody: string
}): Promise<SupportTicketDeliveryResult> {
  let delivery: SupportTicketDeliveryResult = { status: 'failed' }

  if (hasEmailEnv()) {
    const message = await buildSupportRequesterReplyEmail({
      requesterEmail: input.requesterEmail,
      ticketSubject: input.ticketSubject,
      replyBody: input.replyBody,
      adminUrl: adminUrl(`/admin/support/${input.ticketId}`),
    })
    const result = await sendEmail({
      to: NEXEZ_SUPPORT_INBOX,
      replyTo: input.requesterEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
      idempotencyKey: `support-requester-reply/${input.messageId}`,
      tags: [
        { name: 'stream', value: 'support' },
        { name: 'kind', value: 'requester-reply' },
      ],
    })
    delivery = result.ok
      ? { status: 'sent', ...(result.id ? { emailId: result.id } : {}) }
      : { status: 'failed' }
  }

  if (!hasSupabaseAdminEnv()) return delivery

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('support_ticket_events').insert({
      ticket_id: input.ticketId,
      event_type: delivery.status === 'sent' ? 'email_sent' : 'email_failed',
      metadata: {
        kind: 'requester_reply',
        message_id: input.messageId,
        ...(delivery.emailId ? { email_id: delivery.emailId } : {}),
      },
    })
    if (error) throw error
  } catch (error) {
    captureError(error, {
      area: 'support-requester-reply-delivery-state',
      ticketId: input.ticketId,
      deliveryStatus: delivery.status,
    })
  }

  return delivery
}
