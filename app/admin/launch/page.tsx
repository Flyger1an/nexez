import { LaunchControlDashboard } from '../../../components/dashboard/LaunchControlDashboard'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getLaunchControlSnapshot } from '../../../lib/server/launch-control'
import { getMarketplaceCurationQueue } from '../../../lib/server/marketplace-curation'
import { getReleaseCertificationHistory } from '../../../lib/server/release-certification'

export default async function AdminLaunchPage() {
  await requirePlatformAdmin('/admin/launch')
  const [snapshot, releases, marketplaceCuration] = await Promise.all([
    getLaunchControlSnapshot(),
    getReleaseCertificationHistory(),
    getMarketplaceCurationQueue(),
  ])

  return (
    <LaunchControlDashboard
      snapshot={snapshot}
      releases={releases}
      marketplaceCuration={marketplaceCuration}
    />
  )
}
