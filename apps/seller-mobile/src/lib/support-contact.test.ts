import { describe, expect, it } from 'vitest'
import { NEXEZ_SUPPORT_EMAIL, NEXEZ_SUPPORT_MAILTO } from './support-contact'

describe('seller support contact', () => {
  it('routes email support to the Nexez support mailbox', () => {
    expect(NEXEZ_SUPPORT_EMAIL).toBe('support@nexez.ai')
    expect(NEXEZ_SUPPORT_MAILTO).toBe('mailto:support@nexez.ai')
  })
})
