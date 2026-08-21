import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.hoisted(() => vi.fn(async () => ({ id: 'admin-1' })))
const getSnapshot = vi.hoisted(() => vi.fn(async () => ({ generatedAt: '2026-08-14T00:00:00.000Z' })))
const getReleases = vi.hoisted(() => vi.fn(async () => []))
const getMarketplace = vi.hoisted(() => vi.fn(async () => ({ available: true, items: [] })))
const getDemand = vi.hoisted(() => vi.fn(async () => ({ available: true, categories: [] })))

vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: requireAdmin }))
vi.mock('../../../lib/server/launch-control', () => ({ getLaunchControlSnapshot: getSnapshot }))
vi.mock('../../../lib/server/release-certification', () => ({ getReleaseCertificationHistory: getReleases }))
vi.mock('../../../lib/server/marketplace-curation', () => ({ getMarketplaceCurationQueue: getMarketplace }))
vi.mock('../../../lib/server/commerce-demand', () => ({ getCommerceDemandSnapshot: getDemand }))
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
    expect(getReleases).toHaveBeenCalledOnce()
    expect(getMarketplace).toHaveBeenCalledOnce()
    expect(getDemand).toHaveBeenCalledOnce()
  })
})
