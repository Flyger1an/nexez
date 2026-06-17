import { describe, it, expect } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import { getOwnerPlanId, ownerAllows, isPlatformAdmin } from './plan'

// Build a client where `admin` decides the platform_admins row and `sub` the
// billing_subscriptions row. `adminError` simulates a missing/erroring table.
function client(opts: { admin?: boolean; sub?: { plan_id: string; status: string } | null; adminError?: boolean }) {
  return createSupabaseMock((ctx: QueryContext) => {
    if (ctx.table === 'platform_admins') {
      if (opts.adminError) return { data: null, error: { message: 'relation "platform_admins" does not exist' } }
      return { data: opts.admin ? { user_id: 'owner-1' } : null, error: null }
    }
    if (ctx.table === 'billing_subscriptions') return { data: opts.sub ?? null, error: null }
    return { data: null, error: null }
  }) as any
}

describe('getOwnerPlanId — admin short-circuit', () => {
  it('resolves an admin to enterprise regardless of subscription', async () => {
    expect(await getOwnerPlanId(client({ admin: true, sub: null }), 'owner-1')).toBe('enterprise')
    // even a free/canceled sub is overridden
    expect(await getOwnerPlanId(client({ admin: true, sub: { plan_id: 'free', status: 'canceled' } }), 'owner-1')).toBe('enterprise')
  })

  it('a non-admin still resolves from the subscription ladder', async () => {
    expect(await getOwnerPlanId(client({ admin: false, sub: { plan_id: 'pro', status: 'active' } }), 'owner-1')).toBe('pro')
    expect(await getOwnerPlanId(client({ admin: false, sub: null }), 'owner-1')).toBe('free')
    // inactive subscription → free
    expect(await getOwnerPlanId(client({ admin: false, sub: { plan_id: 'scale', status: 'canceled' } }), 'owner-1')).toBe('free')
  })

  it('billing resolution is unaffected when platform_admins errors (e.g. pre-migration)', async () => {
    expect(await getOwnerPlanId(client({ adminError: true, sub: { plan_id: 'pro', status: 'active' } }), 'owner-1')).toBe('pro')
  })

  it('returns free for a null owner', async () => {
    expect(await getOwnerPlanId(client({}), null)).toBe('free')
  })
})

describe('admin entitlements', () => {
  it('unlocks the highest-tier features (Scale+ / Enterprise)', async () => {
    const c = client({ admin: true })
    expect(await ownerAllows(c, 'owner-1', 'teamCollaboration')).toBe(true) // Scale+
    expect(await ownerAllows(c, 'owner-1', 'sso')).toBe(true) // Enterprise
    expect(await ownerAllows(c, 'owner-1', 'whiteLabel')).toBe(true)
  })

  it('a free non-admin does NOT get those features', async () => {
    const c = client({ admin: false, sub: null })
    expect(await ownerAllows(c, 'owner-1', 'teamCollaboration')).toBe(false)
    expect(await ownerAllows(c, 'owner-1', 'sso')).toBe(false)
  })
})

describe('isPlatformAdmin', () => {
  it('reflects the platform_admins row', async () => {
    expect(await isPlatformAdmin(client({ admin: true }), 'owner-1')).toBe(true)
    expect(await isPlatformAdmin(client({ admin: false }), 'owner-1')).toBe(false)
    expect(await isPlatformAdmin(client({}), null)).toBe(false)
  })
})
