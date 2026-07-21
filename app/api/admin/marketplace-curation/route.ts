import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { MARKETPLACE_CURATION_STATUSES } from '../../../../lib/marketplace-curation'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  MarketplaceCurationError,
  updateMarketplaceCuration,
} from '../../../../lib/server/marketplace-curation'
import { isPlatformAdmin } from '../../../../lib/server/plan'
import { createClient } from '../../../../utils/supabase/server'

const decisionSchema = z.object({
  pageId: z.string().uuid(),
  status: z.enum(MARKETPLACE_CURATION_STATUSES),
  decisionReason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
}).strict()

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, 'admin:marketplace-curation', 30, 60_000)
  if (limited) return limited

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Platform admin access is required.' }, { status: 403 })
  }

  let parsed: z.infer<typeof decisionSchema>
  try {
    parsed = decisionSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'Invalid curation decision.'
      : 'Invalid JSON.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const item = await updateMarketplaceCuration({
      ...parsed,
      actorId: user.id,
    })
    return NextResponse.json({ ok: true, item })
  } catch (error) {
    if (error instanceof MarketplaceCurationError) {
      const status = error.code === 'not_configured'
        ? 503
        : error.code === 'not_found'
          ? 404
          : error.code === 'certification_blocked'
            ? 409
            : error.code === 'invalid_decision'
              ? 400
              : 500
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    return NextResponse.json({ error: 'The curation decision could not be saved.' }, { status: 500 })
  }
}
