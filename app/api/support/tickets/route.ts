import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'

type SupportTicketInput = {
  pageId?: string
  targetName?: string
  subject?: string
  category?: string
  priority?: string
  query?: string
  aiResponse?: string
  reference?: string
  metadata?: Record<string, unknown>
}

type SupabaseLikeError = {
  code?: string
  message?: string
}

const allowedCategories = new Set(['general', 'page_setup', 'agent_visibility', 'integrations', 'billing', 'bug', 'feature_request', 'transaction'])
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent'])

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'support-tickets', 12, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: SupportTicketInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const subject = (body.subject || '').trim()
  const query = (body.query || '').trim()
  const category = allowedCategories.has(body.category || '') ? body.category! : 'general'
  const priority = allowedPriorities.has(body.priority || '') ? body.priority! : 'normal'

  if (subject.length < 4) {
    return NextResponse.json({ error: 'Subject is required.' }, { status: 400 })
  }

  if (query.length < 8) {
    return NextResponse.json({ error: 'Question is required.' }, { status: 400 })
  }

  let pageName = body.targetName || 'Workspace'
  let pageId: string | null = null

  if (body.pageId && body.pageId !== 'workspace') {
    const { data: page, error } = await supabase
      .from('pages')
      .select('id,name,slug')
      .eq('id', body.pageId)
      .eq('owner_id', user.id)
      .maybeSingle<{ id: string; name: string; slug: string }>()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!page) return NextResponse.json({ error: 'Selected page was not found.' }, { status: 404 })

    pageId = page.id
    pageName = page.name
  }

  // Optional transaction reference (a negotiation/order id or Stripe session) so a
  // money issue is a trackable case, not a generic ticket. Capped + nullable.
  const reference = (body.reference || '').trim().slice(0, 200) || null

  const ticket = {
    owner_id: user.id,
    page_id: pageId,
    page_name: pageName,
    subject,
    category,
    priority,
    query,
    reference,
    ai_response: body.aiResponse || null,
    metadata: {
      ...(body.metadata || {}),
      user_email: user.email,
      source: 'support_page',
    },
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert(ticket)
    .select('id,status,created_at')
    .single<{ id: string; status: string; created_at: string }>()

  if (error) {
    if (isMissingRelationError(error)) {
      const fallbackId = `pending-${Date.now().toString(36)}`
      return NextResponse.json(
        {
          ok: true,
          persisted: false,
          id: fallbackId,
          status: 'open',
          message: 'Ticket prepared. Apply the support_tickets migration to persist tickets in Supabase.',
        },
        { status: 202 },
      )
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    id: data.id,
    status: data.status,
    createdAt: data.created_at,
  })
}

function isMissingRelationError(error: SupabaseLikeError) {
  return error.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(error.message ?? '')
}
