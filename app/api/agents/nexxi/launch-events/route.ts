import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { NexxiLaunchEventSchema } from '../../../../../lib/nexxi-launch-analytics'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { createAdminClient } from '../../../../../utils/supabase/admin'

export const maxDuration = 15

export async function POST(request: NextRequest) {
  const ipLimited = await enforceRateLimit(request, 'agents:nexxi:launch-events', 120, 60_000)
  if (ipLimited) return ipLimited

  if (Number(request.headers.get('content-length') || 0) > 8_192) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 })
  }

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const userLimited = await enforceRateLimit(request, 'agents:nexxi:launch-events:user', 90, 60_000, {
    subject: auth.user.id,
  })
  if (userLimited) return userLimited

  const body = await request.json().catch(() => null)
  const parsed = NexxiLaunchEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid launch event.' }, { status: 400 })
  }

  const event = parsed.data
  try {
    const { error } = await createAdminClient().from('nexxi_launch_events').insert({
      user_id: auth.user.id,
      client_event_id: event.clientEventId,
      event_name: event.eventName,
      outcome: event.outcome,
      platform: event.platform,
      app_version: event.appVersion,
      build_version: event.buildVersion,
      runtime_version: event.runtimeVersion,
      update_id: event.updateId,
      channel: event.channel,
    })

    if (!error) return NextResponse.json({ ok: true, replayed: false }, { status: 202 })
    if (error.code === '23505') return NextResponse.json({ ok: true, replayed: true }, { status: 202 })
    throw error
  } catch (error) {
    console.error('[Nexxi launch analytics] insert failed', error)
    return NextResponse.json({ error: 'Could not record launch event.' }, { status: 500 })
  }
}
