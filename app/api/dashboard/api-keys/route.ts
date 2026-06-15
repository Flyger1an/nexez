import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { generateApiKey } from '../../../../lib/api-keys'
import { ownerAllows } from '../../../../lib/server/plan'

/**
 * Mint a new API key for the authenticated dashboard user. The raw key is
 * returned exactly once here; only its SHA-256 hash is stored. Listing and
 * revoking are done client-side via RLS (owners manage their own keys).
 */
export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Plan gate: programmatic API access is a Pro feature. Minting is the chokepoint —
  // keys can't exist without it, so gating here is sufficient.
  if (!(await ownerAllows(supabase, user.id, 'apiAccess'))) {
    return NextResponse.json({ error: 'API access is available on the Pro plan and up.', upgrade: 'pro' }, { status: 402 })
  }

  let name = 'API key'
  try {
    const body = await request.json()
    if (typeof body?.name === 'string' && body.name.trim()) name = body.name.trim().slice(0, 60)
  } catch {
    // no body is fine
  }

  const { raw, prefix, keyHash } = generateApiKey()
  const { data, error } = await supabase
    .from('api_keys')
    .insert({ owner_id: user.id, name, key_hash: keyHash, prefix })
    .select('id, name, prefix, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // raw is returned ONCE — never retrievable again.
  return NextResponse.json({ ...data, raw }, { status: 201 })
}
