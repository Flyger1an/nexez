import { LaunchControlDashboard } from '../../../components/dashboard/LaunchControlDashboard'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getLaunchControlSnapshot } from '../../../lib/server/launch-control'
import { getMarketplaceCurationQueue } from '../../../lib/server/marketplace-curation'
import { getReleaseCertificationHistory } from '../../../lib/server/release-certification'
import { getCommerceDemandSnapshot } from '../../../lib/server/commerce-demand'
import { getCommerceSupplyWorkflowSnapshot } from '../../../lib/server/commerce-supply-workflow'

export default async function AdminLaunchPage() {
  await requirePlatformAdmin('/admin/launch')
  const [snapshot, releases, marketplaceCuration, commerceDemand] = await Promise.all([
    getLaunchControlSnapshot(),
    getReleaseCertificationHistory(),
    getMarketplaceCurationQueue(),
    getCommerceDemandSnapshot(),
  ])
  const commerceSupplyWorkflow = await getCommerceSupplyWorkflowSnapshot(
    commerceDemand,
    marketplaceCuration,
  )

  return (
    <LaunchControlDashboard
      snapshot={snapshot}
      releases={releases}
      marketplaceCuration={marketplaceCuration}
      commerceDemand={commerceDemand}
      commerceSupplyWorkflow={commerceSupplyWorkflow}
    />
  )
}
