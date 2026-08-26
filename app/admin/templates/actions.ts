'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import {
  decideCommerceTemplateReview,
  openCommerceTemplateReview,
} from '../../../lib/server/commerce-template-reviews'
import {
  isCommerceTemplateReviewDecision,
  isCommerceTemplateReviewReason,
} from '../../../lib/commerce-template-reviews'

export type TemplateReviewActionState = {
  ok: boolean
  message: string
  completedToken?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TEMPLATE_ID_PATTERN = /^[a-z0-9]+([.-][a-z0-9]+)+$/

export async function openTemplateReviewAction(
  _previousState: TemplateReviewActionState,
  formData: FormData,
): Promise<TemplateReviewActionState> {
  const operator = await requirePlatformAdmin('/admin/templates')
  const templateId = String(formData.get('templateId') ?? '')
  const templateVersion = Number(formData.get('templateVersion'))
  const reviewReason = String(formData.get('reviewReason') ?? '')
  const rationale = String(formData.get('rationale') ?? '').trim()
  const idempotencyToken = String(formData.get('idempotencyToken') ?? '')

  if (!TEMPLATE_ID_PATTERN.test(templateId) || templateId.length > 160) {
    return { ok: false, message: 'Choose a valid Commerce Template guide.' }
  }
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    return { ok: false, message: 'Choose a valid guide version.' }
  }
  if (!isCommerceTemplateReviewReason(reviewReason)) {
    return { ok: false, message: 'Choose why this guide needs review.' }
  }
  if (rationale.length < 10 || rationale.length > 2_000) {
    return { ok: false, message: 'Add a review note between 10 and 2,000 characters.' }
  }
  if (!UUID_PATTERN.test(idempotencyToken)) {
    return { ok: false, message: 'Refresh the review desk before opening this review.' }
  }

  try {
    await openCommerceTemplateReview({
      templateId,
      templateVersion,
      reviewReason,
      rationale,
      idempotencyKey: idempotencyToken,
      operatorId: operator.id,
    })
    revalidatePath('/admin/templates')
    return { ok: true, message: 'Guide review opened.', completedToken: idempotencyToken }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The guide review could not be opened.',
    }
  }
}

export async function decideTemplateReviewAction(
  _previousState: TemplateReviewActionState,
  formData: FormData,
): Promise<TemplateReviewActionState> {
  const operator = await requirePlatformAdmin('/admin/templates')
  const reviewId = String(formData.get('reviewId') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const rationale = String(formData.get('rationale') ?? '').trim()
  const idempotencyToken = String(formData.get('idempotencyToken') ?? '')

  if (!UUID_PATTERN.test(reviewId)) {
    return { ok: false, message: 'Refresh the review desk before deciding this review.' }
  }
  if (!isCommerceTemplateReviewDecision(decision)) {
    return { ok: false, message: 'Choose keep, revise, or recommend retirement.' }
  }
  if (rationale.length < 10 || rationale.length > 2_000) {
    return { ok: false, message: 'Add a decision note between 10 and 2,000 characters.' }
  }
  if (!UUID_PATTERN.test(idempotencyToken)) {
    return { ok: false, message: 'Refresh the review desk before recording this decision.' }
  }

  try {
    await decideCommerceTemplateReview({
      reviewId,
      decision,
      rationale,
      idempotencyKey: idempotencyToken,
      operatorId: operator.id,
    })
    revalidatePath('/admin/templates')
    return { ok: true, message: 'Guide review decision recorded.', completedToken: idempotencyToken }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The guide review decision could not be recorded.',
    }
  }
}
