import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'
import { getOwnerPlanId } from '../../lib/server/plan'
import { ensureTrialSeeded } from '../../lib/server/trial'
import { PlanProvider } from '../../components/billing/PlanProvider'

/**
 * Resolves the viewer's plan once for the whole dashboard and provides it via
 * context, so client dashboard pages can gate features (PlanGate) without a
 * per-page fetch or a first-paint flash. Also the subtree-wide auth gate
 * (defense-in-depth behind the proxy gate + the per-page getUser() redirects):
 * a DEFINITIVE signed-out answer redirects to login; a transient auth error
 * falls through to the free-gated render instead of bouncing a logged-in user
 * (per-page gates still enforce), so a blip can't cause a redirect loop.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let plan: Awaited<ReturnType<typeof getOwnerPlanId>> = 'free'
  let signedOut = false
  // A transient auth/billing blip here should degrade to a free-gated dashboard,
  // not 500 the whole subtree. Failing soft to 'free' introduces no auth hole
  // (it only restricts features).
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    signedOut = !user && !authError
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

  // Outside the try: redirect() throws NEXT_REDIRECT, which the catch above
  // must never swallow.
  if (signedOut) redirect('/login?next=/dashboard')

  return <PlanProvider plan={plan}>{children}</PlanProvider>
}
