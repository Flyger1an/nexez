import { Globe2 } from 'lucide-react'
import { GlassCard } from '../../../components/billing/billing-ui'
import {
  displayCurrencyCode,
  type InternationalOperationsSummary,
} from '../../../lib/international-operations'

export function InternationalOperationsCard({ summary }: { summary: InternationalOperationsSummary }) {
  const currencies = summary.settlementCurrencies.map(displayCurrencyCode).join(', ')
  const payoutAccount = summary.accountCountryLabel
    ? `Your connected Stripe account is based in ${summary.accountCountryLabel}.`
    : 'Stripe account country is not available in this view.'
  const payoutCurrency = summary.defaultPayoutCurrency
    ? ` Its default payout currency is ${displayCurrencyCode(summary.defaultPayoutCurrency)}.`
    : ''
  const conversion = summary.hasPotentialPayoutConversion
    ? ' Some sales use another currency, so Stripe may convert funds before payout. Nexez does not estimate that rate.'
    : ' Nexez does not convert or estimate payout amounts.'

  return (
    <GlassCard className="mt-6 p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Globe2 className="size-4 text-[var(--ready)]" /> International payments
          </h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Clear currency, tax, and payout boundaries for cross-border sales.
          </p>
        </div>
        <span className="rounded-full border border-[var(--bd-10)] bg-black/20 px-3 py-1.5 text-[11px] text-[var(--fg-muted)]">
          Display {summary.locale} · reporting dates UTC
        </span>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--bd-10)] bg-black/20 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Currencies stay separate</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {currencies
              ? `${currencies} ${summary.multiCurrency ? 'are' : 'is'} reported separately. Nexez never combines them into one sales total.`
              : 'No settled sales currencies are available yet. Nexez will report each currency separately.'}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--bd-10)] bg-black/20 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Payouts follow Stripe</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {payoutAccount}{payoutCurrency}{conversion}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--bd-10)] bg-black/20 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Taxes and regional rules</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Nexez does not calculate or add tax to these service checkouts. Review the rules where you sell and deliver. Stripe controls country support, verification, and payout timing.
          </p>
        </div>
      </div>
    </GlassCard>
  )
}
