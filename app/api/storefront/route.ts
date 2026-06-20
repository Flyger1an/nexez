import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'
import { normalizeHandle } from '../../../lib/storefront'
import { enforceRateLimit } from '../../../lib/rate-limit'

/**
 * Create or update the signed-in owner's storefront (brand identity for
 * /store/<handle>). Owner-scoped: the upsert runs through the user's session client so
 * the "owners manage own storefront" RLS (owner_id = auth.uid()) is the gate; we never
 * trust a client-supplied owner_id. Handle is normalized to the DB-safe slug; a clash
 * with another storefront's handle (the UNIQUE constraint) surfaces as a clean 409.
 */
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

  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const accentRaw = str(body.accent_color, 32)
  const row = {
    owner_id: user.id,
    handle,
    display_name: str(body.display_name, 120),
    description: str(body.description, 500),
    logo_url: str(body.logo_url, 500),
    // Only accept a hex color (the landing applies it as an inline style value).
    accent_color: accentRaw && /^#[0-9a-f]{3,8}$/i.test(accentRaw) ? accentRaw : null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('storefronts')
    .upsert(row, { onConflict: 'owner_id' })
    .select('handle, display_name, description, logo_url, accent_color')
    .maybeSingle()
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That handle is already taken. Try another.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, storefront: data })
}
