import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  applyGrowthCampaignControl,
  GrowthControlError,
} from '../../../../lib/server/growth-control'
import { isPlatformAdmin } from '../../../../lib/server/plan'
import { createClient } from '../../../../utils/supabase/server'

const baseFields = {
  campaignId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
}

const controlSchema = z.discriminatedUnion('action', [
  z.object({ ...baseFields, action: z.literal('pause') }).strict(),
  z.object({ ...baseFields, action: z.literal('resume') }).strict(),
  z.object({ ...baseFields, action: z.literal('end') }).strict(),
  z.object({
    ...baseFields,
    action: z.literal('set_capacity'),
    maxGrants: z.number().int().min(1).max(100_000),
  }).strict(),
  z.object({
    ...baseFields,
    action: z.literal('set_signup_close'),
    signupClosesAt: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
])

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

  const limited = await enforceRateLimit(request, 'admin:growth-campaign', 12, 60_000, {
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

  let input: z.infer<typeof controlSchema>
  try {
    input = controlSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'Invalid campaign control.'
      : 'Invalid JSON.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const snapshot = await applyGrowthCampaignControl({
      ...input,
      actorId: user.id,
      maxGrants: input.action === 'set_capacity' ? input.maxGrants : null,
      signupClosesAt: input.action === 'set_signup_close' ? input.signupClosesAt : null,
    })
    return NextResponse.json(
      { ok: true, snapshot },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof GrowthControlError) {
      const status = error.code === 'not_configured'
        ? 503
        : error.code === 'not_found'
          ? 404
          : error.code === 'invalid'
            ? 400
            : error.code === 'conflict'
              ? 409
              : 500
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    return NextResponse.json({ error: 'The campaign control could not be applied.' }, { status: 500 })
  }
}
