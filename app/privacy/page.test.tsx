import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SMS_PRIVACY_NON_SHARING_COPY } from '../../lib/sms-consent'
import PrivacyPage from './page'

describe('Privacy Policy SMS disclosure', () => {
  it('states what SMS data is collected and uses the canonical non-sharing language', () => {
    const markup = renderToStaticMarkup(<PrivacyPage />)

    expect(markup).toContain('records your opt-in, verification, and opt-out status')
    expect(markup).toContain(SMS_PRIVACY_NON_SHARING_COPY)
    expect(markup).toContain('Last updated: August 28, 2026')
  })
})
