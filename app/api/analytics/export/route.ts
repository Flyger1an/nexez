import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { analyticsRangeBounds, buildAnalyticsCsv, clampHistoryRange, filterAnalyticsEvents } from '../../../../lib/analytics'
import { CheckoutEvent } from '../../../../lib/checkout-events'
import { createClient } from '../../../../utils/supabase/server'
import { getOwnerPlanId } from '../../../../lib/server/plan'
import { planAllows } from '../../../../lib/billing'

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
  // analyticsHistory (Pro) gate: All-time + custom date ranges are Pro-only.
  // Clamp them to the default 30-day window for lower tiers so a hand-crafted
  // `?range=all` / `?from=...` can't pull history beyond the free window.
  const fullHistory = planAllows(await getOwnerPlanId(supabase, user.id), 'analyticsHistory')
  const window = clampHistoryRange(
    {
      range: sp.get('range') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    },
    fullHistory,
  )
  // Honor the same time window as the analytics page (preset or custom from/to).
  const { cutoff, until } = analyticsRangeBounds(window)

  let query = supabase
    .from('checkout_events')
    .select('*')
    .eq('owner_id', user.id)
    .gte('created_at', cutoff.toISOString())
  if (until) query = query.lte('created_at', until.toISOString())
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1000)
    .returns<CheckoutEvent[]>()

  if (error) {
    return NextResponse.json({ error: 'Could not export analytics.' }, { status: 500 })
  }

  const action = sp.get('action') || 'all'
  const events = filterAnalyticsEvents(data ?? [], {
    query: sp.get('q') ?? undefined,
    pageId: sp.get('page') ?? undefined,
    action,
  })
  const csv = buildAnalyticsCsv(events)
  const timestamp = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nexez-agent-analytics-${timestamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
