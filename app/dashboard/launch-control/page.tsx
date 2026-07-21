import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { LaunchControlDashboard } from '../../../components/dashboard/LaunchControlDashboard'
import { getLaunchControlSnapshot } from '../../../lib/server/launch-control'
import { getMarketplaceCurationQueue } from '../../../lib/server/marketplace-curation'
import { getReleaseCertificationHistory } from '../../../lib/server/release-certification'
import { isPlatformAdmin } from '../../../lib/server/plan'
import { createClient } from '../../../utils/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LaunchControlPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/dashboard/launch-control')
  if (!(await isPlatformAdmin(supabase, user.id))) notFound()

  const [snapshot, releases, marketplaceCuration] = await Promise.all([
    getLaunchControlSnapshot(),
    getReleaseCertificationHistory(),
    getMarketplaceCurationQueue(),
  ])
  return <LaunchControlDashboard snapshot={snapshot} releases={releases} marketplaceCuration={marketplaceCuration} />
}
