import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'
import { MAX_STOREFRONTS_PER_ACCOUNT, normalizeHandle } from '../../../lib/storefront'
import { loadStorefrontsForOwner } from '../../../lib/server/storefront'
import { enforceRateLimit } from '../../../lib/rate-limit'

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
    logo_url: str(body.logo_url, 500),
    // Only accept a hex color (the landing applies it as an inline style value).
    accent_color: accentRaw && /^#[0-9a-f]{3,8}$/i.test(accentRaw) ? accentRaw : null,
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
  const handle = normalizeHandle(body.handle)
  if (!handle) return NextResponse.json({ error: 'Enter a valid handle (letters, numbers, and hyphens).' }, { status: 400 })
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null
  const fields = brandFields(body)

  // Update an existing storefront by id. RLS (owner_id = auth.uid()) scopes the row to the
  // caller; a non-owner's id matches no row → 404. handle stays globally unique → 23505.
  if (id) {
    const { data, error } = await supabase
      .from('storefronts')
      .update({ handle, ...fields })
      .eq('id', id)
      .select('id, handle, display_name, description, logo_url, accent_color')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That handle is already taken. Try another.' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (!data) return NextResponse.json({ error: 'Storefront not found.' }, { status: 404 })
    return NextResponse.json({ ok: true, storefront: data })
  }

  // Create a NEW storefront — cap per account (a guard-rail, not a plan gate in v1).
  // Counted via the session client (RLS scopes it to the caller's own storefronts).
  const { count } = await supabase
    .from('storefronts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
  if ((count ?? 0) >= MAX_STOREFRONTS_PER_ACCOUNT) {
    return NextResponse.json(
      { error: `You can create up to ${MAX_STOREFRONTS_PER_ACCOUNT} storefronts.` },
      { status: 409 },
    )
  }
  const { data, error } = await supabase
    .from('storefronts')
    .insert({ owner_id: user.id, handle, ...fields })
    .select('id, handle, display_name, description, logo_url, accent_color')
    .maybeSingle()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That handle is already taken. Try another.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, storefront: data })
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

  // RLS scopes the page to the caller (owner UPDATE policy); the DB trigger rejects a
  // storefront the caller doesn't own (42501 → 403). No row updated → 404.
  const { data, error } = await supabase
    .from('pages')
    .update({ storefront_id: storefrontId })
    .eq('id', pageId)
    .select('id, storefront_id')
    .maybeSingle()
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'That storefront isn’t yours.' }, { status: 403 })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  return NextResponse.json({ ok: true, page: data })
}
