import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  applyGrowthCohortControl,
  releaseGrowthCohortWave,
  stageGrowthCohortBatch,
} from '../../../../lib/server/growth-cohort'
import {
  applyGrowthCampaignControl,
  GrowthControlError,
} from '../../../../lib/server/growth-control'
import { isPlatformAdmin } from '../../../../lib/server/plan'
import { appUrl } from '../../../../lib/site'
import { isValidEmail } from '../../../../lib/team'
import { createClient } from '../../../../utils/supabase/server'

const baseFields = {
  campaignId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
}

const cohortCandidateSchema = z.object({
  email: z.string().trim().min(3).max(320).refine(isValidEmail, 'Enter a valid business email.'),
  label: z.string().trim().min(1).max(120).nullable(),
  wave: z.number().int().min(1).max(20),
  verificationStatus: z.enum(['unverified', 'valid', 'risky', 'invalid', 'unknown']),
  verificationProvider: z.string().trim().min(1).max(120).nullable(),
}).strict().superRefine((candidate, context) => {
  if (candidate.verificationStatus !== 'unverified' && !candidate.verificationProvider) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['verificationProvider'],
      message: 'Verified results must identify their verification provider.',
    })
  }
  if (
    candidate.verificationStatus === 'valid'
    && candidate.verificationProvider !== 'millionverifier'
    && candidate.verificationProvider !== 'apollo'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['verificationProvider'],
      message: 'Valid release candidates require Apollo or MillionVerifier evidence.',
    })
  }
})

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
  z.object({
    ...baseFields,
    action: z.literal('set_enrollment_mode'),
    enrollmentMode: z.enum(['open', 'invite_only']),
  }).strict(),
  z.object({
    ...baseFields,
    action: z.literal('cohort_add'),
    email: z.string().trim().min(3).max(320).refine(isValidEmail, 'Enter a valid business email.'),
    label: z.string().trim().min(1).max(120).nullable().optional(),
  }).strict(),
  z.object({
    ...baseFields,
    action: z.literal('cohort_resend'),
    memberId: z.string().uuid(),
  }).strict(),
  z.object({
    ...baseFields,
    action: z.literal('cohort_revoke'),
    memberId: z.string().uuid(),
  }).strict(),
  z.object({
    ...baseFields,
    action: z.literal('cohort_stage_batch'),
    candidates: z.array(cohortCandidateSchema).min(1).max(100),
  }).strict(),
  z.object({
    ...baseFields,
    action: z.literal('cohort_release_wave'),
    wave: z.number().int().min(1).max(20),
    limit: z.number().int().min(1).max(25),
    confirmation: z.string().min(1).max(40),
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
    if (input.action === 'cohort_stage_batch') {
      const result = await stageGrowthCohortBatch({
        ...input,
        actorId: user.id,
      })
      return NextResponse.json(
        { ok: true, ...result },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (input.action === 'cohort_release_wave') {
      const result = await releaseGrowthCohortWave({
        ...input,
        actorId: user.id,
      })
      return NextResponse.json(
        { ok: true, ...result },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (
      input.action === 'cohort_add'
      || input.action === 'cohort_resend'
      || input.action === 'cohort_revoke'
    ) {
      const result = await applyGrowthCohortControl({
        ...input,
        actorId: user.id,
        memberId: input.action === 'cohort_add' ? null : input.memberId,
        email: input.action === 'cohort_add' ? input.email : null,
        label: input.action === 'cohort_add' ? input.label ?? null : null,
      })

      const snapshot = result.snapshot
      const claimUrl = result.token ? appUrl(`/invite/${result.token}`) : null
      return NextResponse.json(
        {
          ok: true,
          snapshot,
          member: snapshot.cohortMembers.find((member) => member.id === result.member.id) ?? result.member,
          claimUrl,
          emailed: false,
          replayed: result.replayed,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const snapshot = await applyGrowthCampaignControl({
      ...input,
      actorId: user.id,
      maxGrants: input.action === 'set_capacity' ? input.maxGrants : null,
      signupClosesAt: input.action === 'set_signup_close' ? input.signupClosesAt : null,
      enrollmentMode: input.action === 'set_enrollment_mode' ? input.enrollmentMode : null,
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
