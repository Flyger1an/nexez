import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { getOwnerPlanId } from '../../../../lib/server/plan'
import { supportServiceForPlan, type SupportService } from '../../../../lib/support-routing'
import { deliverSupportTicketNotification } from '../../../../lib/server/support-email'
import { getRequesterSupportTickets } from '../../../../lib/server/requester-support'

type SupportTicketInput = {
  pageId?: string
  targetName?: string
  subject?: string
  category?: string
  priority?: string
  query?: string
  aiResponse?: string
  reference?: string
  metadata?: unknown
}

type SupabaseLikeError = {
  code?: string
  message?: string
}

const allowedCategories = new Set(['general', 'page_setup', 'agent_visibility', 'integrations', 'billing', 'bug', 'feature_request', 'transaction'])
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent'])

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [supportService, tickets] = await Promise.all([
    resolveSupportService(supabase, user.id),
    getRequesterSupportTickets(supabase, user.id),
  ])

  return NextResponse.json({ supportService, tickets })
}

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

  const supportService = await resolveSupportService(supabase, user.id)

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
      ...safeMetadata(body.metadata),
      user_email: user.email,
      source: 'support_page',
      // Audit-only submission snapshot. Operator routing always derives the
      // CURRENT plan independently, so this cannot preserve priority after a
      // downgrade and a caller cannot self-assign paid routing.
      entitlement_plan_at_submission: supportService.planId,
      support_service_tier_at_submission: supportService.tier,
      priority_support_at_submission: supportService.priorityRouting,
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
          supportService,
          message: 'Ticket prepared. Apply the support_tickets migration to persist tickets in Supabase.',
        },
        { status: 202 },
      )
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const notification = await deliverSupportTicketNotification({
    id: data.id,
    requesterEmail: user.email ?? 'unknown requester',
    subject,
    category,
    priority,
    targetName: pageName,
    query,
    reference,
    supportTier: supportService.tier,
  })

  return NextResponse.json({
    ok: true,
    persisted: true,
    id: data.id,
    status: data.status,
    createdAt: data.created_at,
    notificationStatus: notification.status,
    supportService,
    requestPath: `/support/requests/${data.id}`,
  })
}

async function resolveSupportService(
  supabase: Parameters<typeof getOwnerPlanId>[0],
  ownerId: string,
): Promise<SupportService> {
  try {
    return supportServiceForPlan(await getOwnerPlanId(supabase, ownerId))
  } catch {
    return supportServiceForPlan(null)
  }
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function isMissingRelationError(error: SupabaseLikeError) {
  return error.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(error.message ?? '')
}
