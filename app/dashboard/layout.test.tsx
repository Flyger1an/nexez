import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  user: null as any,
  authError: null as any,
  plan: 'free' as any,
}))
const trial = vi.hoisted(() => ({
  ensure: vi.fn(),
  hasBilling: vi.fn(),
  isTrialable: vi.fn((value: unknown) => ['launch', 'pro', 'scale'].includes(String(value))),
}))
const redirect = vi.hoisted(() => vi.fn((location: string) => {
  throw new Error(`NEXT_REDIRECT:${location}`)
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('../../utils/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: refs.user }, error: refs.authError }) } }),
}))
vi.mock('../../lib/server/plan', () => ({ getOwnerPlanId: vi.fn(async () => refs.plan) }))
vi.mock('../../lib/server/trial', () => ({
  ensureTrialSeeded: trial.ensure,
  hasBillingAccount: trial.hasBilling,
  isTrialablePlan: trial.isTrialable,
}))
vi.mock('../../components/billing/PlanProvider', () => ({ PlanProvider: ({ children }: any) => children }))

import DashboardLayout from './layout'

describe('DashboardLayout plan gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'user-1', user_metadata: {} }
    refs.authError = null
    refs.plan = 'free'
    trial.hasBilling.mockResolvedValue(false)
    trial.ensure.mockResolvedValue(false)
  })

  it('redirects a plan-less account to onboarding instead of silently assigning Pro', async () => {
    await expect(DashboardLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/onboard?next=/dashboard')
    expect(trial.ensure).not.toHaveBeenCalled()
  })

  it('seeds an explicit trialable selection and continues', async () => {
    refs.user.user_metadata = { plan: 'pro' }
    trial.ensure.mockResolvedValue(true)

    await expect(DashboardLayout({ children: null })).resolves.toBeTruthy()
    expect(trial.ensure).toHaveBeenCalledWith('user-1', 'pro')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('preserves existing billing state, including non-conferring legacy or paused rows', async () => {
    trial.hasBilling.mockResolvedValue(true)

    await expect(DashboardLayout({ children: null })).resolves.toBeTruthy()
    expect(trial.ensure).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})
