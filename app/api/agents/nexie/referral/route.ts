import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../../lib/agents/nexie-auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'

export const maxDuration = 30

// Unambiguous alphabet (no 0/O/1/I/L). 7 chars ≈ 27 bits - plenty for invite codes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 7

function genCode(): string {
  const bytes = new Uint8Array(CODE_LEN)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/** Get-or-create the caller's stable referral code (service-role: guarantees uniqueness). */
async function ensureCode(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  const { data: existing } = await admin.from('referral_codes').select('code').eq('user_id', userId).maybeSingle<{ code: string }>()
  if (existing?.code) return existing.code
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode()
    const { error } = await admin.from('referral_codes').insert({ user_id: userId, code })
    if (!error) return code
    if (error.code === '23505') {
      // Either the code collided (retry) or the row now exists (race) - re-read and use it.
      const { data } = await admin.from('referral_codes').select('code').eq('user_id', userId).maybeSingle<{ code: string }>()
      if (data?.code) return data.code
      continue
    }
    return null
  }
  return null
}

/** GET - the buyer's invite code + how many people have joined with it. */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:referral', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Referrals are not available right now.' }, { status: 503 })

  const admin = createAdminClient()
  const code = await ensureCode(admin, auth.user.id)
  if (!code) return NextResponse.json({ error: 'Could not create your invite code.' }, { status: 500 })

  const { count } = await admin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', auth.user.id)

  return NextResponse.json({ ok: true, code, referralCount: count ?? 0 })
}

/** POST { code } - claim someone's invite code (once per account; no self-referral). */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:referral', 15, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Referrals are not available right now.' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as { code?: unknown }
  const code = (typeof body.code === 'string' ? body.code : '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN)
  if (code.length !== CODE_LEN) return NextResponse.json({ error: 'Enter a valid invite code.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: owner } = await admin.from('referral_codes').select('user_id').eq('code', code).maybeSingle<{ user_id: string }>()
  if (!owner) return NextResponse.json({ error: "That invite code doesn't exist." }, { status: 404 })
  if (owner.user_id === auth.user.id) return NextResponse.json({ error: "You can't use your own invite code." }, { status: 400 })

  const { error } = await admin.from('referrals').insert({
    referrer_user_id: owner.user_id,
    referred_user_id: auth.user.id,
    code,
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: "You've already used an invite code." }, { status: 409 })
    console.error('[Nexie] referral claim failed', error)
    return NextResponse.json({ error: 'Could not apply that invite code.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
