import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.hoisted(() => vi.fn(async () => ({ id: 'admin-1' })))
const getSnapshot = vi.hoisted(() => vi.fn(async () => ({ generatedAt: '2026-08-14T00:00:00.000Z' })))
const getReleases = vi.hoisted(() => vi.fn(async () => []))
const getDecisions = vi.hoisted(() => vi.fn(async () => []))
const getMarketplace = vi.hoisted(() => vi.fn(async () => ({ available: true, items: [] })))
const getDemand = vi.hoisted(() => vi.fn(async () => ({ available: true, categories: [] })))
const getSupplyWorkflow = vi.hoisted(() => vi.fn(async () => ({ available: true, items: [] })))

vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: requireAdmin }))
vi.mock('../../../lib/server/launch-control', () => ({ getLaunchControlSnapshot: getSnapshot }))
vi.mock('../../../lib/server/release-certification', () => ({
  getReleaseCertificationHistory: getReleases,
  getReleaseDeploymentIdentity: vi.fn(() => ({
    revision: 'a'.repeat(40),
    deploymentId: 'dpl_test',
    deploymentUrl: 'https://nexez.ai',
    environment: 'production',
  })),
}))
vi.mock('../../../lib/server/launch-decision', () => ({ getLaunchDecisionHistory: getDecisions }))
vi.mock('../../../lib/launch-decision', () => ({
  buildLaunchDecisionEvidence: vi.fn(() => ({ goEligible: false, certificate: null, blockers: [] })),
}))
vi.mock('../../../lib/server/marketplace-curation', () => ({ getMarketplaceCurationQueue: getMarketplace }))
vi.mock('../../../lib/server/commerce-demand', () => ({ getCommerceDemandSnapshot: getDemand }))
vi.mock('../../../lib/server/commerce-supply-workflow', () => ({ getCommerceSupplyWorkflowSnapshot: getSupplyWorkflow }))
vi.mock('../../../components/dashboard/LaunchControlDashboard', () => ({
  LaunchControlDashboard: ({ snapshot }: { snapshot: { generatedAt: string } }) => <div>{snapshot.generatedAt}</div>,
}))

import AdminLaunchPage from './page'

describe('AdminLaunchPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('authorizes before loading every live Launch Control domain', async () => {
    await expect(AdminLaunchPage()).resolves.toBeTruthy()
    expect(requireAdmin).toHaveBeenCalledWith('/admin/launch')
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(getSnapshot.mock.invocationCallOrder[0])
    expect(getSnapshot).toHaveBeenCalledOnce()
    expect(getReleases).toHaveBeenCalledWith(25)
    expect(getDecisions).toHaveBeenCalledOnce()
    expect(getMarketplace).toHaveBeenCalledOnce()
    expect(getDemand).toHaveBeenCalledOnce()
    expect(getSupplyWorkflow).toHaveBeenCalledWith(
      { available: true, categories: [] },
      { available: true, items: [] },
    )
  })
})
