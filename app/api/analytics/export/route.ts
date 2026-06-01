import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { buildAnalyticsCsv, filterAnalyticsEvents } from '../../../../lib/analytics'
import { CheckoutEvent } from '../../../../lib/checkout-events'
import { createClient } from '../../../../utils/supabase/server'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in to export analytics.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('checkout_events')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1000)
    .returns<CheckoutEvent[]>()

  if (error) {
    return NextResponse.json({ error: 'Could not export analytics.' }, { status: 500 })
  }

  const action = request.nextUrl.searchParams.get('action') || 'all'
  const events = filterAnalyticsEvents(data ?? [], {
    query: request.nextUrl.searchParams.get('q') ?? undefined,
    pageId: request.nextUrl.searchParams.get('page') ?? undefined,
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
