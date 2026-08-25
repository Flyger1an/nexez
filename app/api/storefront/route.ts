import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'
import { normalizeHandle } from '../../../lib/storefront'
import {
  normalizePublicIdentifier,
  publicIdentifierDatabaseMessage,
  validatePublicIdentifier,
} from '../../../lib/public-identifier'
import { getBillingPlan, getLimitUpgradeDecision, minPlanForFeature, planAllows } from '../../../lib/billing'
import { getOwnerPlanId } from '../../../lib/server/plan'
import { loadStorefrontsForOwner } from '../../../lib/server/storefront'
import { enforceRateLimit } from '../../../lib/rate-limit'
import {
  entitlementAllocationRetryBody,
  entitlementAllocationRetryInit,
  isEntitlementAllocationRetry,
} from '../../../lib/entitlement-allocation-error'

function allocationRetryResponse() {
  return NextResponse.json(entitlementAllocationRetryBody, entitlementAllocationRetryInit)
}

/**
 * The signed-in owner's storefronts (Phase 4: an account owns 1..N). Brand identity for
 * /store/<handle>. Every mutation runs through the user's SESSION client so the "owners
 * manage own storefront" RLS (owner_id = auth.uid()) is the gate; we never trust a
 * client-supplied owner_id, and the DB trigger nz_pages_enforce_storefront_owner blocks
 * cross-tenant listing assignment.
 *
 *  GET   → { storefronts: StorefrontWithCount[] }   (oldest first; [0] is the primary)
 *  POST  → create a new storefront (no id, cap-limited) OR update one by id
 *  PATCH → move a listing to one of the owner's storefronts ({ pageId, storefrontId })
 */
export async function GET() {
  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const storefronts = await loadStorefrontsForOwner(user.id)
  return NextResponse.json({ storefronts })
}

function brandFields(body: Record<string, unknown>) {
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const accentRaw = str(body.accent_color, 32)
  return {
    display_name: str(body.display_name, 120),
    description: str(body.description, 500),
    ...(Object.hasOwn(body, 'logo_url') ? { logo_url: str(body.logo_url, 500) } : {}),
    // Only accept a hex color (the landing applies it as an inline style value).
    ...(Object.hasOwn(body, 'accent_color')
      ? { accent_color: accentRaw && /^#[0-9a-f]{3,8}$/i.test(accentRaw) ? accentRaw : null }
      : {}),
    updated_at: new Date().toISOString(),
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'storefront-save', 20, 60_000)
  if (limited) return limited

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const normalizedHandle = normalizePublicIdentifier(body.handle)
  const handle = normalizeHandle(body.handle)
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null
  let currentHandle: string | null = null
  if (id) {
    const { data: current } = await supabase
      .from('storefronts')
      .select('handle')
      .eq('id', id)
      .eq('owner_id', user.id)
      .maybeSingle<{ handle: string }>()
    if (!current) return NextResponse.json({ error: 'Storefront not found.' }, { status: 404 })
    currentHandle = current.handle
  }
  const handleValidation = validatePublicIdentifier(normalizedHandle, { current: currentHandle })
  if (!handleValidation.ok) {
    return NextResponse.json({ error: handleValidation.message }, { status: 400 })
  }
  const fields = brandFields(body)
  const planId = await getOwnerPlanId(supabase, user.id)
  if ((fields.logo_url || fields.accent_color) && !planAllows(planId, 'whiteLabel')) {
    const required = minPlanForFeature('whiteLabel')
    return NextResponse.json(
      {
        error: `Storefront logo and accent customization require the ${required.name} plan.`,
        code: 'plan_feature_required',
        upgrade: required.id,
      },
      { status: 402 },
    )
  }

  // Update an existing storefront by id. RLS (owner_id = auth.uid()) scopes the row to the
  // caller; a non-owner's id matches no row → 404. handle stays globally unique → 23505.
  if (id) {
    const { data, error } = await supabase
      .from('storefronts')
      .update({ handle, ...fields })
      .eq('id', id)
      .select('id, handle, display_name, description, logo_url, accent_color, plan_suspended_at')
      .maybeSingle()
    if (error) {
      if (isEntitlementAllocationRetry(error)) return allocationRetryResponse()
      const identifierError = publicIdentifierDatabaseMessage(error)
      if (identifierError) return NextResponse.json({ error: identifierError }, { status: error.code === '23505' ? 409 : 400 })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (!data) return NextResponse.json({ error: 'Storefront not found.' }, { status: 404 })
    return NextResponse.json({ ok: true, storefront: data })
  }

  // Create a NEW storefront under the canonical plan capacity. The serialized
  // database trigger is authoritative; this preflight returns a useful upgrade
  // decision before attempting the write.
  const countResult = await supabase
    .from('storefronts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
  const { count } = countResult
  const decision = getLimitUpgradeDecision(planId, 'storefronts', (count ?? 0) + 1)
  if (!decision.allowed) {
    const upgradePlan = decision.upgradePlanId ? getBillingPlan(decision.upgradePlanId) : null
    return NextResponse.json(
      {
        error: `Your ${getBillingPlan(planId)?.name ?? 'current'} plan includes ${decision.currentLimit} storefront${decision.currentLimit === 1 ? '' : 's'}.`,
        code: 'plan_limit_reached',
        limit: decision.currentLimit,
        upgrade: upgradePlan?.id ?? null,
      },
      { status: 402 },
    )
  }
  const { data, error } = await supabase
    .from('storefronts')
    .insert({ owner_id: user.id, handle, ...fields })
    .select('id, handle, display_name, description, logo_url, accent_color, plan_suspended_at')
    .maybeSingle()
  if (error) {
    if (isEntitlementAllocationRetry(error)) return allocationRetryResponse()
    const identifierError = publicIdentifierDatabaseMessage(error)
    if (identifierError) return NextResponse.json({ error: identifierError }, { status: error.code === '23505' ? 409 : 400 })
    if (error.code === '23514' || /storefront limit/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Your storefront limit was reached. Refresh your plan and try again.', code: 'plan_limit_reached' },
        { status: 402 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, storefront: data })
}

/** Delete one owned storefront. Its listings are retained and become unassigned
 * through the database FK; entitlement reconciliation immediately restores the
 * next retained storefront when the owner was over quota after a downgrade. */
export async function DELETE(request: Request) {
  const limited = await enforceRateLimit(request, 'storefront-delete', 20, 60_000)
  if (limited) return limited

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { id?: unknown }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || id.length > 128) {
    return NextResponse.json({ error: 'A valid storefront ID is required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('storefronts')
    .delete()
    .eq('owner_id', user.id)
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    if (isEntitlementAllocationRetry(error)) return allocationRetryResponse()
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Storefront not found.' }, { status: 404 })
  return NextResponse.json({ ok: true, id: data.id })
}

/** Move one of the owner's listings to one of the owner's storefronts. */
export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, 'storefront-assign', 40, 60_000)
  if (limited) return limited

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { pageId?: string; storefrontId?: string }
  const pageId = (body.pageId || '').trim()
  const storefrontId = (body.storefrontId || '').trim()
  if (!pageId || !storefrontId) return NextResponse.json({ error: 'Missing pageId or storefrontId.' }, { status: 400 })

  // Scope explicitly to the account owner. Editors can update ordinary listing
  // content under page RLS, but storefront assignment is owner-level workspace
  // administration and is independently protected by the database trigger.
  const { data, error } = await supabase
    .from('pages')
    .update({ storefront_id: storefrontId })
    .eq('id', pageId)
    .eq('owner_id', user.id)
    .select('id, storefront_id')
    .maybeSingle()
  if (error) {
    if (isEntitlementAllocationRetry(error)) return allocationRetryResponse()
    if (error.code === '42501') return NextResponse.json({ error: 'That storefront isn’t yours.' }, { status: 403 })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  return NextResponse.json({ ok: true, page: data })
}
