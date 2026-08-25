'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { recordLaunchDecision } from '../../../lib/server/launch-decision'
import type { LaunchDecision } from '../../../lib/launch-decision'

export type LaunchDecisionActionState = {
  ok: boolean
  message: string
  completedToken?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function recordLaunchDecisionAction(
  _previousState: LaunchDecisionActionState,
  formData: FormData,
): Promise<LaunchDecisionActionState> {
  const operator = await requirePlatformAdmin('/admin/launch')
  const decision = String(formData.get('decision') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const idempotencyToken = String(formData.get('idempotencyToken') ?? '').trim()

  if (decision !== 'go' && decision !== 'hold') {
    return { ok: false, message: 'Choose go or hold.' }
  }
  if (reason.length < 3 || reason.length > 1_000) {
    return { ok: false, message: 'Add a decision note between 3 and 1,000 characters.' }
  }
  if (!UUID_PATTERN.test(idempotencyToken)) {
    return { ok: false, message: 'Refresh Launch Control before recording the decision.' }
  }
  if (!operator.email) {
    return { ok: false, message: 'This admin account needs an email before it can record a launch decision.' }
  }

  try {
    await recordLaunchDecision({
      decision: decision as LaunchDecision,
      reason,
      idempotencyKey: idempotencyToken,
      operatorId: operator.id,
      operatorEmail: operator.email,
    })
    revalidatePath('/admin/launch')
    revalidatePath('/admin/audit')
    return {
      ok: true,
      message: decision === 'go' ? 'Go decision recorded.' : 'Hold decision recorded.',
      completedToken: idempotencyToken,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The launch decision could not be recorded.',
    }
  }
}
