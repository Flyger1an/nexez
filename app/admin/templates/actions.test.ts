import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ id: '30000000-0000-4000-8000-000000000001' })),
  openReview: vi.fn(async () => ({ replayed: false, event: { id: 'event-1' } })),
  decideReview: vi.fn(async () => ({ replayed: false, event: { id: 'event-2' } })),
  revalidate: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: mocks.requireAdmin }))
vi.mock('../../../lib/server/commerce-template-reviews', () => ({
  openCommerceTemplateReview: mocks.openReview,
  decideCommerceTemplateReview: mocks.decideReview,
}))

import { decideTemplateReviewAction, openTemplateReviewAction } from './actions'

const TOKEN = '20000000-0000-4000-8000-000000000001'
const REVIEW_ID = '10000000-0000-4000-8000-000000000001'
const OPERATOR_ID = '30000000-0000-4000-8000-000000000001'

describe('Commerce Template review actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rechecks platform-admin access and opens an exact guide review', async () => {
    const form = new FormData()
    form.set('templateId', 'events.party-rentals')
    form.set('templateVersion', '1')
    form.set('reviewReason', 'catalog_overlap')
    form.set('rationale', '  Review overlapping guide coverage before recruitment.  ')
    form.set('idempotencyToken', TOKEN)

    await expect(openTemplateReviewAction({ ok: false, message: '' }, form)).resolves.toEqual({
      ok: true,
      message: 'Guide review opened.',
      completedToken: TOKEN,
    })
    expect(mocks.requireAdmin).toHaveBeenCalledWith('/admin/templates')
    expect(mocks.openReview).toHaveBeenCalledWith({
      templateId: 'events.party-rentals',
      templateVersion: 1,
      reviewReason: 'catalog_overlap',
      rationale: 'Review overlapping guide coverage before recruitment.',
      idempotencyKey: TOKEN,
      operatorId: OPERATOR_ID,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin/templates')
  })

  it('rejects malformed guide input before touching the review ledger', async () => {
    const form = new FormData()
    form.set('templateId', '../../pages')
    form.set('templateVersion', '0')
    form.set('reviewReason', 'performance')
    form.set('rationale', 'Attempt an invalid review.')
    form.set('idempotencyToken', TOKEN)

    await expect(openTemplateReviewAction({ ok: false, message: '' }, form)).resolves.toEqual({
      ok: false,
      message: 'Choose a valid Commerce Template guide.',
    })
    expect(mocks.openReview).not.toHaveBeenCalled()
  })

  it('does not accept browser-supplied evidence or operator identity', async () => {
    const form = new FormData()
    form.set('templateId', 'events.party-rentals')
    form.set('templateVersion', '1')
    form.set('reviewReason', 'manual')
    form.set('rationale', 'Record an operator review with current server evidence.')
    form.set('idempotencyToken', TOKEN)
    form.set('operatorId', 'attacker')
    form.set('evidenceSnapshot', '{"performanceReviewReady":true}')

    await openTemplateReviewAction({ ok: false, message: '' }, form)

    expect(mocks.openReview).toHaveBeenCalledWith(expect.not.objectContaining({ operatorId: 'attacker' }))
    expect(mocks.openReview).toHaveBeenCalledWith(expect.not.objectContaining({ evidenceSnapshot: expect.anything() }))
  })

  it('records a bounded decision against an existing review identifier', async () => {
    const form = new FormData()
    form.set('reviewId', REVIEW_ID)
    form.set('decision', 'revise')
    form.set('rationale', '  Revise the intake and send the change through code review.  ')
    form.set('idempotencyToken', TOKEN)

    await expect(decideTemplateReviewAction({ ok: false, message: '' }, form)).resolves.toEqual({
      ok: true,
      message: 'Guide review decision recorded.',
      completedToken: TOKEN,
    })
    expect(mocks.decideReview).toHaveBeenCalledWith({
      reviewId: REVIEW_ID,
      decision: 'revise',
      rationale: 'Revise the intake and send the change through code review.',
      idempotencyKey: TOKEN,
      operatorId: OPERATOR_ID,
    })
  })

  it('rejects an invalid review decision before the server mutation', async () => {
    const form = new FormData()
    form.set('reviewId', REVIEW_ID)
    form.set('decision', 'publish')
    form.set('rationale', 'Attempt an unsupported registry mutation.')
    form.set('idempotencyToken', TOKEN)

    await expect(decideTemplateReviewAction({ ok: false, message: '' }, form)).resolves.toEqual({
      ok: false,
      message: 'Choose keep, revise, or recommend retirement.',
    })
    expect(mocks.decideReview).not.toHaveBeenCalled()
  })
})
