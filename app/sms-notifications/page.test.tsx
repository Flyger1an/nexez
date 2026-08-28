import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { appUrl, marketingUrl } from '../../lib/site'
import {
  SMS_CONSENT_CORE_COPY,
  SMS_SAMPLE_MESSAGE,
  SMS_SETTINGS_PATH,
} from '../../lib/sms-consent'
import SmsNotificationsPage, { metadata } from './page'

describe('SMS notifications public disclosure', () => {
  it('is canonical to the public marketing URL', () => {
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/sms-notifications'))
    expect(metadata.openGraph?.url).toBe(marketingUrl('/sms-notifications'))
  })

  it('shows the exact consent, sample message, settings URL, and opt-out terms', () => {
    const markup = renderToStaticMarkup(<SmsNotificationsPage />)

    expect(markup).toContain(SMS_CONSENT_CORE_COPY.replaceAll('&', '&amp;'))
    expect(markup).toContain(SMS_SAMPLE_MESSAGE)
    expect(markup).toContain(appUrl(SMS_SETTINGS_PATH))
    expect(markup).toContain('Reply STOP to opt out or HELP for help.')
    expect(markup).toContain('checkbox is always unchecked by default')
  })
})
