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

  it.each([
    [{ message: 'PUBLIC_IDENTIFIER_REQUIRED' }, /choose a public name/i],
    [{ message: 'PUBLIC_IDENTIFIER_TOO_SHORT' }, /at least 5/i],
    [{ message: 'PUBLIC_IDENTIFIER_TOO_LONG' }, /no more than 63/i],
    [{ message: 'PUBLIC_IDENTIFIER_INVALID_FORMAT' }, /lowercase letters/i],
    [{ message: 'PUBLIC_IDENTIFIER_RESERVED' }, /reserved/i],
    [{ message: 'PUBLIC_IDENTIFIER_TAKEN' }, /already taken/i],
    [{ code: '23505', message: 'pages_slug_key' }, /already taken/i],
  ])('maps the public identifier database contract for %o', (error, expected) => {
    expect(listingWriteErrorMessage(error)).toMatch(expected)
  })

  it('turns plain PostgREST objects into displayable Errors', () => {
    expect(toListingWriteError({ message: 'Write failed' })).toEqual(new Error('Write failed'))
    expect(listingWriteErrorMessage(null)).toBe('Could not update this listing.')
  })
})
