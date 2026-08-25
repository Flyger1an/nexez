import { randomUUID } from 'node:crypto'
import { LaunchControlDashboard } from '../../../components/dashboard/LaunchControlDashboard'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getLaunchControlSnapshot } from '../../../lib/server/launch-control'
import { getMarketplaceCurationQueue } from '../../../lib/server/marketplace-curation'
import {
  getReleaseCertificationHistory,
  getReleaseDeploymentIdentity,
} from '../../../lib/server/release-certification'
import { getCommerceDemandSnapshot } from '../../../lib/server/commerce-demand'
import { getCommerceSupplyWorkflowSnapshot } from '../../../lib/server/commerce-supply-workflow'
import { getLaunchDecisionHistory } from '../../../lib/server/launch-decision'
import { buildLaunchDecisionEvidence } from '../../../lib/launch-decision'
import { getMcpDemandSnapshot } from '../../../lib/server/mcp-demand'

export default async function AdminLaunchPage() {
  await requirePlatformAdmin('/admin/launch')
  const [snapshot, releases, launchDecisions, marketplaceCuration, commerceDemand, mcpDemand] = await Promise.all([
    getLaunchControlSnapshot(),
    getReleaseCertificationHistory(25),
    getLaunchDecisionHistory(),
    getMarketplaceCurationQueue(),
    getCommerceDemandSnapshot(),
    getMcpDemandSnapshot(),
  ])
  const commerceSupplyWorkflow = await getCommerceSupplyWorkflowSnapshot(
    commerceDemand,
    marketplaceCuration,
  )
  const launchDecisionEvidence = buildLaunchDecisionEvidence({
    snapshot,
    releases,
    deployment: getReleaseDeploymentIdentity(),
  })

  return (
    <LaunchControlDashboard
      snapshot={snapshot}
      releases={releases}
      marketplaceCuration={marketplaceCuration}
      commerceDemand={commerceDemand}
      commerceSupplyWorkflow={commerceSupplyWorkflow}
      mcpDemand={mcpDemand}
      launchDecisions={launchDecisions}
      launchDecisionEvidence={launchDecisionEvidence}
      initialLaunchDecisionToken={randomUUID()}
    />
  )
}
