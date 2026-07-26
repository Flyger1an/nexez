import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

vi.mock('../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
}))

import { ensureBillingSeeded, isSelectablePlan, isTrialablePlan } from './trial'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

describe('trial seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  })

  it('recognizes only self-serve paid plans as trialable', () => {
    expect(isTrialablePlan('launch')).toBe(true)
    expect(isTrialablePlan('pro')).toBe(true)
    expect(isTrialablePlan('scale')).toBe(true)
    expect(isTrialablePlan(undefined)).toBe(false)
    expect(isTrialablePlan('')).toBe(false)
    expect(isTrialablePlan('free')).toBe(false)
    expect(isTrialablePlan('enterprise')).toBe(false)
    expect(isTrialablePlan('made-up')).toBe(false)
  })

  it('recognizes Free and paid self-serve plans as selectable', () => {
    expect(isSelectablePlan('free')).toBe(true)
    expect(isSelectablePlan('launch')).toBe(true)
    expect(isSelectablePlan('pro')).toBe(true)
    expect(isSelectablePlan('scale')).toBe(true)
    expect(isSelectablePlan('enterprise')).toBe(false)
    expect(isSelectablePlan('made-up')).toBe(false)
  })

  it('never invents a Pro trial when plan metadata is missing or invalid', async () => {
    const admin = createSupabaseMock(() => ({ data: null, error: null }))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    expect(await ensureBillingSeeded('owner-1', undefined)).toBe(false)
    expect(await ensureBillingSeeded('owner-1', 'made-up')).toBe(false)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('seeds the explicit plan once and preserves an existing billing row', async () => {
    const writes: QueryContext[] = []
    let existing = false
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'select') return { data: existing ? { owner_id: 'owner-1' } : null, error: null }
        writes.push({ ...ctx, calls: [...ctx.calls] })
        existing = true
        return { data: null, error: null }
      }) as any,
    )

    expect(await ensureBillingSeeded('owner-1', 'scale')).toBe(true)
    expect(writes).toHaveLength(1)
    expect(writes[0]?.payload).toMatchObject({ owner_id: 'owner-1', plan_id: 'scale', status: 'trialing' })
    expect(await ensureBillingSeeded('owner-1', 'pro')).toBe(false)
    expect(writes).toHaveLength(1)
  })

  it('seeds Free as active with no trial expiry', async () => {
    const writes: QueryContext[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'select') return { data: null, error: null }
        writes.push({ ...ctx, calls: [...ctx.calls] })
        return { data: null, error: null }
      }) as any,
    )

    expect(await ensureBillingSeeded('owner-1', 'free')).toBe(true)
    expect(writes[0]?.payload).toMatchObject({
      owner_id: 'owner-1',
      plan_id: 'free',
      status: 'active',
      trial_ends_at: null,
      account_origin: 'free',
    })
  })
})
