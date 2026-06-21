import { describe, it, expect } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import { getOwnerPlanId, getOwnerBillingState, ownerAllows, isPlatformAdmin } from './plan'

type SubRow = { plan_id: string; status: string; trial_ends_at?: string | null; account_origin?: string | null }
const future = () => new Date(Date.now() + 86_400_000).toISOString()
const past = () => new Date(Date.now() - 86_400_000).toISOString()

// Build a client where `admin` decides the platform_admins row and `sub` the
// billing_subscriptions row. `adminError` simulates a missing/erroring table.
function client(opts: { admin?: boolean; sub?: SubRow | null; adminError?: boolean }) {
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

describe('getOwnerPlanId — trials & paused', () => {
  it('an in-window trial confers the chosen plan', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: future() } }), 'owner-1')).toBe('pro')
  })
  it('an EXPIRED trial does not confer → free', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: past() } }), 'owner-1')).toBe('free')
  })
  it('a paused account → free (no paid features)', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'pro', status: 'paused', account_origin: 'trial' } }), 'owner-1')).toBe('free')
  })
  it('dunning (past_due/unpaid) still confers', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'scale', status: 'past_due' } }), 'owner-1')).toBe('scale')
  })
})

describe('getOwnerBillingState', () => {
  it('reports an in-window trial', async () => {
    const s = await getOwnerBillingState(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: future(), account_origin: 'trial' } }), 'owner-1')
    expect(s).toMatchObject({ planId: 'pro', chosenPlanId: 'pro', isLive: true, isTrialing: true, isPaused: false })
    expect(s.trialEndsAt).toBeTruthy()
  })
  it('reports an expired trial as paused (trial origin) — gating drops to free', async () => {
    const s = await getOwnerBillingState(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: past(), account_origin: 'trial' } }), 'owner-1')
    expect(s).toMatchObject({ planId: 'free', chosenPlanId: 'pro', isLive: false, isTrialing: false, isPaused: true })
  })
  it('a legacy account NEVER pauses (grandfathered to free)', async () => {
    const s = await getOwnerBillingState(client({ sub: { plan_id: 'free', status: 'canceled', account_origin: 'legacy' } }), 'owner-1')
    expect(s.isPaused).toBe(false)
    expect(s.planId).toBe('free')
  })
  it('admin → enterprise, live, never paused', async () => {
    const s = await getOwnerBillingState(client({ admin: true }), 'owner-1')
    expect(s).toMatchObject({ planId: 'enterprise', isLive: true, isPaused: false })
  })
  it('no subscription row → neutral free, not paused', async () => {
    const s = await getOwnerBillingState(client({ sub: null }), 'owner-1')
    expect(s).toMatchObject({ planId: 'free', chosenPlanId: null, isPaused: false, isLive: false })
  })
})
