import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { deliverSupportRequesterReplyNotification } from '../../../../../../lib/server/support-email'
import { createClient } from '../../../../../../utils/supabase/server'

type ReplyInput = {
  body?: unknown
  clientMessageId?: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = await enforceRateLimit(request, 'support-ticket-replies', 20, 60_000)
  if (limited) return limited

  const { id: ticketId } = await context.params
  if (!UUID_PATTERN.test(ticketId)) {
    return NextResponse.json({ error: 'Support request not found.' }, { status: 404 })
  }

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let input: ReplyInput
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const body = typeof input.body === 'string' ? input.body.trim() : ''
  const clientMessageId = typeof input.clientMessageId === 'string' ? input.clientMessageId.trim() : ''
  if (!body) return NextResponse.json({ error: 'Write a reply before sending.' }, { status: 400 })
  if (body.length > 10_000) {
    return NextResponse.json({ error: 'Replies must be 10,000 characters or fewer.' }, { status: 400 })
  }
  if (!UUID_PATTERN.test(clientMessageId)) {
    return NextResponse.json({ error: 'Refresh this page before sending the reply.' }, { status: 400 })
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id,subject,status')
    .eq('id', ticketId)
    .eq('owner_id', user.id)
    .maybeSingle<{ id: string; subject: string; status: string }>()

  if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 500 })
  if (!ticket) return NextResponse.json({ error: 'Support request not found.' }, { status: 404 })
  if (ticket.status === 'closed') {
    return NextResponse.json({ error: 'This support request is closed. Start a new request if you still need help.' }, { status: 409 })
  }

  let message: { id: string; body: string; created_at: string } | null = null
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      body,
      client_message_id: clientMessageId,
    })
    .select('id,body,created_at')
    .single<{ id: string; body: string; created_at: string }>()

  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await supabase
      .from('support_ticket_messages')
      .select('id,body,created_at')
      .eq('ticket_id', ticketId)
      .eq('client_message_id', clientMessageId)
      .maybeSingle<{ id: string; body: string; created_at: string }>()
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (existing && existing.body !== body) {
      return NextResponse.json({ error: 'This reply key is already attached to a different message. Refresh and try again.' }, { status: 409 })
    }
    message = existing
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 409 : 500 })
  } else {
    message = data
  }

  if (!message) return NextResponse.json({ error: 'Could not save your reply.' }, { status: 500 })

  const notification = await deliverSupportRequesterReplyNotification({
    ticketId,
    messageId: message.id,
    requesterEmail: user.email ?? 'unknown requester',
    ticketSubject: ticket.subject,
    replyBody: message.body,
  })

  return NextResponse.json({
    ok: true,
    messageId: message.id,
    createdAt: message.created_at,
    notificationStatus: notification.status,
  })
}
