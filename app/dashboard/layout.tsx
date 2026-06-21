import { cookies } from 'next/headers'
import { createClient } from '../../utils/supabase/server'
import { getOwnerPlanId } from '../../lib/server/plan'
import { ensureTrialSeeded } from '../../lib/server/trial'
import { PlanProvider } from '../../components/billing/PlanProvider'

/**
 * Resolves the viewer's plan once for the whole dashboard and provides it via
 * context, so client dashboard pages can gate features (PlanGate) without a
 * per-page fetch or a first-paint flash. Auth itself is still enforced per-page
 * (each dashboard page does its own getUser() + redirect).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // A transient auth/billing blip here should degrade to a free-gated dashboard,
  // not 500 the whole subtree. Auth/redirect is still enforced per-page, so
  // failing soft to 'free' introduces no auth hole (it only restricts features).
  let plan: Awaited<ReturnType<typeof getOwnerPlanId>> = 'free'
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    plan = await getOwnerPlanId(supabase, user?.id)
    // Backstop so no signup path leaves an account on the retired Free tier: any account
    // that resolves to 'free' with NO billing row gets a trial seeded idempotently (their
    // chosen plan from metadata, else Pro), then we re-resolve so this render reflects it.
    // A real legacy/paid row short-circuits the insert, so grandfathered accounts keep
    // resolving to 'free' without a re-seed.
    if (plan === 'free' && user?.id) {
      if (await ensureTrialSeeded(user.id, user.user_metadata?.plan)) {
        plan = await getOwnerPlanId(supabase, user.id)
      }
    }
  } catch {
    plan = 'free'
  }

  return <PlanProvider plan={plan}>{children}</PlanProvider>
}
