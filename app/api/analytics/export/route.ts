import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { analyticsRangeBounds, clampHistoryRange, filterAnalyticsEvents } from '../../../../lib/analytics'
import { filterAgentVisits, type AgentVisit, type AgentVisitTrafficFilter } from '../../../../lib/agent-visits'
import { buildComprehensiveAnalyticsCsv } from '../../../../lib/analytics-export'
import type { CheckoutEvent } from '../../../../lib/checkout-events'
import type { DirectFinanceRow } from '../../../../lib/finance-analytics'
import { createClient } from '../../../../utils/supabase/server'
import { getOwnerPlanId } from '../../../../lib/server/plan'
import { planAllows } from '../../../../lib/billing'

const PAGE_SIZE = 1000
const MAX_EXPORT_ROWS = 50_000

type PageResult<T> = { data: T[] | null; error: unknown }

async function fetchExportRows<T>(loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  const rows: T[] = []

  while (rows.length <= MAX_EXPORT_ROWS) {
    const { data, error } = await loadPage(rows.length, rows.length + PAGE_SIZE - 1)
    if (error) return { rows: [] as T[], error, overLimit: false }
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return { rows, error: null, overLimit: false }
  }

  return { rows, error: null, overLimit: true }
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in to export analytics.' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const fullHistory = planAllows(await getOwnerPlanId(supabase, user.id), 'analyticsHistory')
  const window = clampHistoryRange(
    {
      range: sp.get('range') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    },
    fullHistory,
  )
  const { cutoff, until } = analyticsRangeBounds(window)
  const pageId = sp.get('page') || null

  const [eventResult, visitResult, orderResult] = await Promise.all([
    fetchExportRows<CheckoutEvent>((from, to) => {
      let query = supabase
        .from('checkout_events')
        .select('*')
        .eq('owner_id', user.id)
        .gte('created_at', cutoff.toISOString())
      if (until) query = query.lte('created_at', until.toISOString())
      if (pageId) query = query.eq('page_id', pageId)
      return query.order('created_at', { ascending: false }).range(from, to).returns<CheckoutEvent[]>()
    }),
    fetchExportRows<AgentVisit>((from, to) => {
      let query = supabase
        .from('agent_visits')
        .select('*')
        .eq('owner_id', user.id)
        .gte('created_at', cutoff.toISOString())
      if (until) query = query.lte('created_at', until.toISOString())
      if (pageId) query = query.eq('page_id', pageId)
      return query.order('created_at', { ascending: false }).range(from, to).returns<AgentVisit[]>()
    }),
    fetchExportRows<DirectFinanceRow>((from, to) => {
      let query = supabase
        .from('checkout_orders')
        .select('id, page_id, offer_name, offer_key, amount_cents, currency, status, channel, slug, refunded_cents, buyer_email, buyer_name, buyer_reference, buyer_agent, commission_percent, application_fee_cents, stripe_livemode, created_at')
        .eq('owner_id', user.id)
        .eq('stripe_livemode', true)
        .gte('created_at', cutoff.toISOString())
      if (until) query = query.lte('created_at', until.toISOString())
      if (pageId) query = query.eq('page_id', pageId)
      return query.order('created_at', { ascending: false }).range(from, to).returns<DirectFinanceRow[]>()
    }),
  ])

  if (eventResult.error || visitResult.error || orderResult.error) {
    return NextResponse.json({ error: 'Could not export analytics.' }, { status: 500 })
  }
  if (eventResult.overLimit || visitResult.overLimit || orderResult.overLimit) {
    return NextResponse.json(
      { error: 'This export is too large. Choose a shorter date range or a single listing and try again.' },
      { status: 413 },
    )
  }

  const queryNeedle = sp.get('q')?.trim().toLowerCase() || ''
  const action = sp.get('action') || 'all'
  const traffic = (['all', 'ai', 'human'].includes(sp.get('traffic') || '')
    ? sp.get('traffic')
    : 'all') as AgentVisitTrafficFilter
  const events = filterAnalyticsEvents(eventResult.rows, { query: queryNeedle, action })
  const visits = filterAgentVisits(visitResult.rows, { query: queryNeedle, traffic })
  const orders = action === 'all' || action === 'stripe_session_created'
    ? orderResult.rows.filter((order) => {
        if (!queryNeedle) return true
        return [order.offer_name, order.offer_key, order.slug, order.buyer_agent, order.buyer_name, order.buyer_email, order.buyer_reference]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(queryNeedle))
      })
    : []

  if (events.length + visits.length + orders.length > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      { error: 'This export is too large. Narrow the filters and try again.' },
      { status: 413 },
    )
  }

  const csv = buildComprehensiveAnalyticsCsv({ events, visits, orders })
  const timestamp = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nexez-analytics-${timestamp}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
