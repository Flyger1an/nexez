import 'server-only'

import type {
  GrowthCohortAction,
  GrowthCohortMember,
  GrowthControlSnapshot,
} from '../growth-control'
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
