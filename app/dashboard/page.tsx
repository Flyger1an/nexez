import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'
import { AgentPage, BASIC_OWNER_PAGE_SELECT, OWNER_PAGE_SELECT } from '../../lib/agent-page'
import { AgentVisit } from '../../lib/agent-visits'
import { CheckoutEvent } from '../../lib/checkout-events'
import { analyticsRangeBounds } from '../../lib/analytics'
import { emptySellerGrowthState, getSellerGrowthState } from '../../lib/server/seller-growth'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { DashboardClient, DashboardInitial } from './DashboardClient'
import { loadOwnerAnalyticsRollup } from '../../lib/server/analytics-rollup'
import { loadNegotiationRollup } from '../../lib/negotiation-report'
import { loadFinanceRollup } from '../../lib/finance-report'
import { getCommercialPlanDefaultCommission, getOwnerBillingState, getOwnerCommission } from '../../lib/server/plan'

// Server component: authenticates + fetches the dashboard's data in one parallel
// wave server-side, then hands it to the client island as initial state - so the
// dashboard renders with real data (no client fetch waterfall, no loading flash).
export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already gates this route; redirect is a defensive backstop.
  if (!user) redirect('/login?next=/dashboard')

  const meta = (user.user_metadata ?? {}) as { full_name?: string; company?: string }
  const displayName = meta.full_name || meta.company || user.email || ''

  const growthPromise = hasSupabaseAdminEnv()
    ? getSellerGrowthState(createAdminClient(), user.id, {
        createdAt: user.created_at,
        emailConfirmedAt: user.email_confirmed_at,
      })
    : Promise.resolve(emptySellerGrowthState())

  // One shared cutoff + exact database rollup keeps Overview aligned with the
  // Analytics "Today" view even after the recent-activity samples hit a limit.
  const todayCutoff = analyticsRangeBounds({ range: 'today' }).cutoff.toISOString()
  const financeCutoff = analyticsRangeBounds({ range: '30d' }).cutoff
  const billingStatePromise = getOwnerBillingState(supabase, user.id)
  const commissionPromise = billingStatePromise.then(async (billingState) => (
    hasSupabaseAdminEnv()
      ? getOwnerCommission(createAdminClient(), user.id, billingState)
      : getCommercialPlanDefaultCommission(billingState)
  ))
  const financePromise = commissionPromise.then((commission) => loadFinanceRollup(supabase, {
    from: financeCutoff,
    fallbackCommissionBps: commission.basisPoints,
  }))

  const [pageRes, eventRes, visitRes, invitesRes, negRes, intakeRes, growthState, analyticsResult, negotiationReport, financeReport] = await Promise.all([
    supabase.from('pages').select(OWNER_PAGE_SELECT).eq('owner_id', user.id).order('created_at', { ascending: false }).returns<AgentPage[]>(),
    supabase.from('checkout_events').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(100).returns<CheckoutEvent[]>(),
    supabase.from('agent_visits').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1000).returns<AgentVisit[]>(),
    supabase.from('team_invites').select('owner_id').eq('email', (user.email ?? '').toLowerCase()).eq('status', 'accepted'),
    supabase.from('agent_negotiations').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).in('status', ['negotiation', 'agreement_proposed', 'held']),
    supabase.from('intake_sessions').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('status', 'handed_off'),
    growthPromise,
    loadOwnerAnalyticsRollup(supabase, { from: new Date(todayCutoff) }),
    loadNegotiationRollup(supabase),
    financePromise,
  ])

  // Fall back to the basic select if newer optional columns aren't migrated yet.
  let pages = pageRes.error ? [] : pageRes.data ?? []
  if (pageRes.error) {
    const basic = await supabase
      .from('pages')
      .select(BASIC_OWNER_PAGE_SELECT)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .returns<AgentPage[]>()
    pages = basic.data ?? []
  }

  let sharedPages: AgentPage[] = []
  const ownerIds = [...new Set((invitesRes.data ?? []).map((i: { owner_id: string }) => i.owner_id))].filter(
    (oid) => oid !== user.id,
  )
  if (ownerIds.length) {
    const shared = await supabase
      .from('pages')
      .select(BASIC_OWNER_PAGE_SELECT)
      .in('owner_id', ownerIds)
      .order('created_at', { ascending: false })
      .returns<AgentPage[]>()
    sharedPages = shared.data ?? []
  }

  const initial: DashboardInitial = {
    pages,
    events: eventRes.error ? [] : eventRes.data ?? [],
    agentVisits: visitRes.error ? [] : visitRes.data ?? [],
    // This legacy field now carries the exact seller-actionable queue count.
    // The direct count is retained as an additive-migration fallback.
    openNegotiations: negotiationReport.data?.counts.needsAction ?? (negRes.error ? 0 : negRes.count ?? 0),
    sharedPages,
    displayName,
    todayCutoff,
    analyticsRollup: analyticsResult.data,
    negotiationRollup: negotiationReport.data,
    financeRollup: financeReport.data,
    commercialDataIssues: [
      analyticsResult.error ? 'today analytics' : null,
      negotiationReport.error ? 'negotiation operations' : null,
      financeReport.error ? '30-day finance' : null,
    ].filter((issue): issue is string => Boolean(issue)),
    // interview_completed (intake spec §8): any interview that reached handoff.
    interviewCompleted: intakeRes.error ? false : (intakeRes.count ?? 0) > 0,
    growthState,
  }

  return <DashboardClient initial={initial} />
}
