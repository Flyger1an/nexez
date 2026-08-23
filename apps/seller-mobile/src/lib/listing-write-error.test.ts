import { describe, expect, it } from 'vitest'
import { listingWriteErrorMessage, toListingWriteError } from './listing-write-error'

describe('mobile listing write errors', () => {
  it('maps only the stable allocation race to an explicit retry message', () => {
    const error = toListingWriteError({
      code: '40001',
      message: 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY',
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toMatch(/try again/i)
    expect(listingWriteErrorMessage({ code: '40001', message: 'unrelated serialization failure' }))
      .toBe('unrelated serialization failure')
  })

  it('preserves the database quota message and hint', () => {
    expect(listingWriteErrorMessage({
      code: '23514',
      message: 'Published listing limit reached for your plan.',
      hint: 'Upgrade or unpublish another listing.',
    })).toBe('Published listing limit reached for your plan. Upgrade or unpublish another listing.')
  })

  it('turns plain PostgREST objects into displayable Errors', () => {
    expect(toListingWriteError({ message: 'Write failed' })).toEqual(new Error('Write failed'))
    expect(listingWriteErrorMessage(null)).toBe('Could not update this listing.')
  })
})
