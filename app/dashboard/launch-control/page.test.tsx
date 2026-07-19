import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({ user: null as null | { id: string }, admin: false }))
const redirect = vi.hoisted(() => vi.fn((location: string) => { throw new Error(`NEXT_REDIRECT:${location}`) }))
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const getSnapshot = vi.hoisted(() => vi.fn(async () => ({ generatedAt: '2026-07-15T00:00:00.000Z' })))
const getReleaseHistory = vi.hoisted(() => vi.fn(async () => []))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('next/navigation', () => ({ redirect, notFound }))
vi.mock('../../../utils/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: refs.user } }) } }),
}))
vi.mock('../../../lib/server/plan', () => ({ isPlatformAdmin: vi.fn(async () => refs.admin) }))
vi.mock('../../../lib/server/launch-control', () => ({ getLaunchControlSnapshot: getSnapshot }))
vi.mock('../../../lib/server/release-certification', () => ({ getReleaseCertificationHistory: getReleaseHistory }))
vi.mock('../../../components/dashboard/LaunchControlDashboard', () => ({
  LaunchControlDashboard: ({ snapshot }: { snapshot: { generatedAt: string } }) => <div>{snapshot.generatedAt}</div>,
}))

import LaunchControlPage from './page'

describe('LaunchControlPage admin boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'admin-1' }
    refs.admin = true
  })

  it('redirects a signed-out viewer before loading operational data', async () => {
    refs.user = null
    await expect(LaunchControlPage()).rejects.toThrow('NEXT_REDIRECT:/login?next=/dashboard/launch-control')
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(getReleaseHistory).not.toHaveBeenCalled()
  })

  it('returns not found for an authenticated non-admin', async () => {
    refs.admin = false
    await expect(LaunchControlPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(getReleaseHistory).not.toHaveBeenCalled()
  })

  it('loads the redacted snapshot for a platform admin', async () => {
    await expect(LaunchControlPage()).resolves.toBeTruthy()
    expect(getSnapshot).toHaveBeenCalledOnce()
    expect(getReleaseHistory).toHaveBeenCalledOnce()
  })
})
