import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  COMMERCE_SUPPLY_CAMPAIGN_STATUSES,
} from '../../../../lib/commerce-supply-campaign'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  applyCommerceSupplyCampaign,
  CommerceSupplyCampaignError,
} from '../../../../lib/server/commerce-supply-workflow'
import { isPlatformAdmin } from '../../../../lib/server/plan'
import { createClient } from '../../../../utils/supabase/server'

const campaignSchema = z.object({
  referenceId: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  status: z.enum(COMMERCE_SUPPLY_CAMPAIGN_STATUSES),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
}).strict()

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 })
  }

  const limited = await enforceRateLimit(request, 'admin:commerce-supply-campaign', 20, 60_000, {
    failClosed: true,
  })
  if (limited) return limited

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Platform admin access is required.' }, { status: 403 })
  }

  let input: z.infer<typeof campaignSchema>
  try {
    input = campaignSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'Invalid campaign transition.'
      : 'Invalid JSON.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const campaign = await applyCommerceSupplyCampaign({ ...input, actorId: user.id })
    return NextResponse.json(
      { ok: true, campaign },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof CommerceSupplyCampaignError) {
      const status = error.code === 'not_configured'
        ? 503
        : error.code === 'verification_unavailable'
          ? 503
        : error.code === 'not_found'
          ? 404
          : error.code === 'invalid'
            ? 400
            : error.code === 'conflict'
              ? 409
              : error.code === 'forbidden'
                ? 403
                : 500
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    return NextResponse.json({ error: 'The campaign transition could not be saved.' }, { status: 500 })
  }
}
