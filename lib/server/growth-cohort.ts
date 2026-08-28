import 'server-only'

import type {
  GrowthCohortBatchCandidate,
  GrowthCohortBatchSummary,
  GrowthCohortAction,
  GrowthCohortMember,
  GrowthCohortReleaseSummary,
  GrowthControlSnapshot,
} from '../growth-control'
import { buildSellerGrowthInviteEmail, hasEmailEnv, sendEmail } from '../email'
import { appUrl } from '../site'
import {
  deriveSellerGrowthInviteToken,
  hashSellerGrowthInviteToken,
} from './seller-growth-token'
import { getGrowthControlSnapshot, GrowthControlError } from './growth-control'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

type CohortRpcResult = {
  member_id?: unknown
  replayed?: unknown
}

type BatchRpcResult = {
  candidate_count?: unknown
  staged_count?: unknown
  updated_count?: unknown
  duplicate_count?: unknown
  waves?: unknown
  replayed?: unknown
}

type ClaimedMember = {
  member_id?: unknown
  email?: unknown
  label?: unknown
  token_seed?: unknown
  attempt?: unknown
}

type ReleaseRpcResult = {
  wave?: unknown
  limit?: unknown
  members?: unknown
  selected_count?: unknown
  already_delivered_count?: unknown
  already_failed_count?: unknown
  replayed?: unknown
}

export type ApplyGrowthCohortInput = {
  campaignId: string
  actorId: string
  action: GrowthCohortAction
  reason: string
  idempotencyKey: string
  memberId?: string | null
  email?: string | null
  label?: string | null
}

export type GrowthCohortMutationResult = {
  snapshot: GrowthControlSnapshot
  member: GrowthCohortMember
  token: string | null
  replayed: boolean
}

export type StageGrowthCohortBatchInput = {
  campaignId: string
  actorId: string
  reason: string
  idempotencyKey: string
  candidates: GrowthCohortBatchCandidate[]
}

export type ReleaseGrowthCohortWaveInput = {
  campaignId: string
  actorId: string
  reason: string
  idempotencyKey: string
  wave: number
  limit: number
  confirmation: string
}

function growthError(error: { code?: string; message?: string } | null | undefined): GrowthControlError {
  const message = error?.message || 'The cohort control could not be applied.'
  const code = error?.code === 'P0002'
    ? 'not_found'
    : error?.code === '23514' || error?.code === '23505'
      ? 'conflict'
      : error?.code === '22023'
        ? 'invalid'
        : 'database'
  return new GrowthControlError(message, code)
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

export async function applyGrowthCohortControl(
  input: ApplyGrowthCohortInput,
): Promise<GrowthCohortMutationResult> {
  if (!hasSupabaseAdminEnv()) {
    throw new GrowthControlError('Growth Control is unavailable on this deployment.', 'not_configured')
  }

  const admin = createAdminClient()
  const needsToken = input.action === 'cohort_add' || input.action === 'cohort_resend'
  const token = needsToken ? deriveSellerGrowthInviteToken(input.idempotencyKey) : null
  const { data, error } = await admin.rpc('apply_seller_growth_cohort_control', {
    p_campaign_id: input.campaignId,
    p_actor_id: input.actorId,
    p_action: input.action,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_member_id: input.memberId ?? null,
    p_email: input.action === 'cohort_add' ? input.email ?? null : null,
    p_label: input.action === 'cohort_add' ? input.label ?? null : null,
    p_token_hash: token ? hashSellerGrowthInviteToken(token) : null,
    p_expires_at: null,
  })

  if (error) throw growthError(error)

  const result = (data ?? {}) as CohortRpcResult
  const memberId = typeof result.member_id === 'string' ? result.member_id : ''
  if (!memberId) throw new GrowthControlError('The cohort mutation returned no member.', 'database')

  const snapshot = await getGrowthControlSnapshot(admin)
  const member = snapshot.cohortMembers.find((item) => item.id === memberId)
  if (!member) throw new GrowthControlError('The cohort roster could not be refreshed.', 'database')

  return {
    snapshot,
    member,
    token,
    replayed: result.replayed === true,
  }
}

export async function recordGrowthCohortDelivery(memberId: string): Promise<void> {
  if (!hasSupabaseAdminEnv()) return
  const admin = createAdminClient()
  const { error } = await admin.rpc('record_seller_growth_cohort_delivery', {
    p_member_id: memberId,
  })
  if (error) throw growthError(error)
}

export async function stageGrowthCohortBatch(
  input: StageGrowthCohortBatchInput,
): Promise<{ snapshot: GrowthControlSnapshot; summary: GrowthCohortBatchSummary }> {
  if (!hasSupabaseAdminEnv()) {
    throw new GrowthControlError('Growth Control is unavailable on this deployment.', 'not_configured')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('stage_seller_growth_cohort_batch', {
    p_campaign_id: input.campaignId,
    p_actor_id: input.actorId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_candidates: input.candidates,
  })
  if (error) throw growthError(error)

  const result = (data ?? {}) as BatchRpcResult
  const waves = Array.isArray(result.waves)
    ? result.waves.map(count).filter((wave) => wave > 0)
    : []
  return {
    snapshot: await getGrowthControlSnapshot(admin),
    summary: {
      candidateCount: count(result.candidate_count),
      stagedCount: count(result.staged_count),
      updatedCount: count(result.updated_count),
      duplicateCount: count(result.duplicate_count),
      waves,
      replayed: result.replayed === true,
    },
  }
}

async function recordDeliveryResult(opts: {
  admin: ReturnType<typeof createAdminClient>
  memberId: string
  releaseKey: string
  delivered: boolean
  error?: string | null
  providerMessageId?: string | null
}): Promise<void> {
  const { error } = await opts.admin.rpc('record_seller_growth_cohort_delivery_result', {
    p_member_id: opts.memberId,
    p_release_key: opts.releaseKey,
    p_delivered: opts.delivered,
    p_error: opts.error ?? null,
    p_provider_message_id: opts.providerMessageId ?? null,
  })
  if (error) throw growthError(error)
}

export async function releaseGrowthCohortWave(
  input: ReleaseGrowthCohortWaveInput,
): Promise<{ snapshot: GrowthControlSnapshot; summary: GrowthCohortReleaseSummary }> {
  if (!hasSupabaseAdminEnv() || !hasEmailEnv()) {
    throw new GrowthControlError('Cohort email delivery is unavailable on this deployment.', 'not_configured')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_seller_growth_cohort_wave', {
    p_campaign_id: input.campaignId,
    p_actor_id: input.actorId,
    p_wave: input.wave,
    p_limit: input.limit,
    p_reason: input.reason,
    p_confirmation: input.confirmation,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw growthError(error)

  const result = (data ?? {}) as ReleaseRpcResult
  const members = Array.isArray(result.members) ? result.members as ClaimedMember[] : []
  const selected = count(result.selected_count) || members.length
  const campaign = (await getGrowthControlSnapshot(admin)).campaign
  if (!campaign) throw new GrowthControlError('The active campaign could not be loaded.', 'database')
  let sent = count(result.already_delivered_count)
  let failed = count(result.already_failed_count)

  for (let offset = 0; offset < members.length; offset += 4) {
    const chunk = members.slice(offset, offset + 4)
    const outcomes = await Promise.all(chunk.map(async (member) => {
      const memberId = typeof member.member_id === 'string' ? member.member_id : ''
      const email = typeof member.email === 'string' ? member.email : ''
      const tokenSeed = typeof member.token_seed === 'string' ? member.token_seed : ''
      const attempt = count(member.attempt)
      if (!memberId || !email || !tokenSeed || attempt < 1) return false

      let delivery: Awaited<ReturnType<typeof sendEmail>>
      try {
        const token = deriveSellerGrowthInviteToken(tokenSeed)
        const mail = await buildSellerGrowthInviteEmail({
          inviterBusinessName: 'Nexez',
          inviteeEmail: email,
          durationDays: campaign.grantDurationDays,
          claimUrl: appUrl(`/invite/${token}`),
        })
        delivery = await sendEmail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          idempotencyKey: `growth-cohort-${memberId}`,
          tags: [
            { name: 'stream', value: 'growth-cohort' },
            { name: 'wave', value: String(input.wave) },
          ],
        })
      } catch (deliveryError) {
        const message = deliveryError instanceof Error ? deliveryError.message : 'Cohort email delivery failed.'
        await recordDeliveryResult({
          admin,
          memberId,
          releaseKey: input.idempotencyKey,
          delivered: false,
          error: message,
        }).catch(() => null)
        return false
      }

      if (!delivery.ok) {
        await recordDeliveryResult({
          admin,
          memberId,
          releaseKey: input.idempotencyKey,
          delivered: false,
          error: delivery.error || 'Email provider rejected the send.',
        }).catch(() => null)
        return false
      }

      try {
        await recordDeliveryResult({
          admin,
          memberId,
          releaseKey: input.idempotencyKey,
          delivered: true,
          providerMessageId: delivery.id ?? null,
        })
        return true
      } catch {
        // Keep the database claim in-flight. A stale reclaim reuses this exact
        // provider idempotency key, so an accepted message is never marked as a
        // send failure and retried as a new attempt.
        return false
      }
    }))
    sent += outcomes.filter(Boolean).length
    failed += outcomes.filter((outcome) => !outcome).length
  }

  return {
    snapshot: await getGrowthControlSnapshot(admin),
    summary: {
      wave: input.wave,
      requested: input.limit,
      selected,
      sent,
      failed,
      replayed: result.replayed === true,
    },
  }
}
