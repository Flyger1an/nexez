import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../../lib/agents/nexie-auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { loadBuyerOrderTokenBySession } from '../../../../../lib/server/load-order'

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:checkout-return', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const sessionId = new URL(request.url).searchParams.get('session_id')?.trim() ?? ''
  if (!/^cs_[A-Za-z0-9_]{8,250}$/.test(sessionId)) {
    return NextResponse.json({ error: 'A valid checkout session is required.' }, { status: 400 })
  }

  try {
    const order = await loadBuyerOrderTokenBySession(sessionId, auth.user.id)
    return NextResponse.json(
      order
        ? { ok: true, state: 'ready', kind: 'order', token: order.token, status: order.status }
        : { ok: true, state: 'pending' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[Nexie] checkout return lookup failed', error)
    return NextResponse.json({ error: 'Could not resolve this checkout yet.' }, { status: 500 })
  }
}
