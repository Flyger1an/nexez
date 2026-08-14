import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.hoisted(() => vi.fn(async () => ({ id: 'admin-1' })))
const getGrowth = vi.hoisted(() => vi.fn(async () => ({ generatedAt: '2026-08-14T00:00:00.000Z' })))

vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: requireAdmin }))
vi.mock('../../../lib/server/growth-control', () => ({ getGrowthControlSnapshot: getGrowth }))
vi.mock('../../../components/dashboard/GrowthControlPanel', () => ({
  GrowthControlPanel: ({ initialSnapshot }: { initialSnapshot: { generatedAt: string } }) => <div>{initialSnapshot.generatedAt}</div>,
}))

import AdminGrowthPage from './page'

describe('AdminGrowthPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('authorizes before loading the real campaign ledger', async () => {
    await expect(AdminGrowthPage()).resolves.toBeTruthy()
    expect(requireAdmin).toHaveBeenCalledWith('/admin/growth')
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(getGrowth.mock.invocationCallOrder[0])
    expect(getGrowth).toHaveBeenCalledOnce()
  })
})
