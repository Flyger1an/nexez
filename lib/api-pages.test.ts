import { describe, expect, it } from 'vitest'
import { getCustomDomainWriteConflict } from './api-pages'

describe('getCustomDomainWriteConflict', () => {
  it('maps a verified claim owned by another account', () => {
    expect(getCustomDomainWriteConflict({
      message: 'This custom domain is already connected to another Nexez account.',
    })).toEqual({
      code: 'custom_domain_claimed',
      error: 'This custom domain is already connected to another Nexez account.',
    })
  })

  it('maps a protected setup reservation', () => {
    expect(getCustomDomainWriteConflict({
      message: 'This custom domain is temporarily reserved while another Nexez account finishes setup.',
    })).toEqual({
      code: 'custom_domain_reserved',
      error: 'This custom domain is temporarily reserved while another Nexez account finishes setup.',
    })
  })

  it('does not relabel unrelated write failures', () => {
    expect(getCustomDomainWriteConflict({ message: 'duplicate key value violates unique constraint' })).toBeNull()
  })
})
