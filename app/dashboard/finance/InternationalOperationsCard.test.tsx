// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '../../../test/dom'
import { InternationalOperationsCard } from './InternationalOperationsCard'

describe('InternationalOperationsCard', () => {
  it('keeps unlike currencies separate and explains payout conversion boundaries', () => {
    render(<InternationalOperationsCard summary={{
      locale: 'en-GB',
      settlementCurrencies: ['usd', 'gbp'],
      multiCurrency: true,
      accountCountryCode: 'GB',
      accountCountryLabel: 'United Kingdom',
      defaultPayoutCurrency: 'gbp',
      hasPotentialPayoutConversion: true,
      conversionMode: 'not_performed',
      taxMode: 'not_calculated',
    }} />)

    expect(screen.getByRole('heading', { name: 'International payments' })).toBeInTheDocument()
    expect(screen.getByText(/USD, GBP are reported separately/)).toBeInTheDocument()
    expect(screen.getByText(/Nexez never combines them into one sales total/)).toBeInTheDocument()
    expect(screen.getByText(/Stripe may convert funds before payout/)).toBeInTheDocument()
    expect(screen.getByText(/Nexez does not calculate or add tax/)).toBeInTheDocument()
    expect(screen.getByText(/Display en-GB · reporting dates UTC/)).toBeInTheDocument()
  })
})
