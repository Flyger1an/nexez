// Multi-currency support for offer checkout. The page carries a `currency`
// (ISO 4217, lowercase) and the offer price strings are plain amounts; the page
// currency is the source of truth for what the buyer is actually charged, so a
// "£50" string on a USD page charges $50 and on a GBP page charges £50 - never a
// silent mismatch. All client-safe (pure, no secrets).

export type SupportedCurrency = {
  code: string // ISO 4217, lowercase (Stripe convention)
  label: string
  symbol: string
}

// Curated set Stripe supports broadly. Lowercase codes (Stripe wants lowercase).
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: 'usd', label: 'USD - US Dollar', symbol: '$' },
  { code: 'eur', label: 'EUR - Euro', symbol: '€' },
  { code: 'gbp', label: 'GBP - British Pound', symbol: '£' },
  { code: 'cad', label: 'CAD - Canadian Dollar', symbol: 'CA$' },
  { code: 'aud', label: 'AUD - Australian Dollar', symbol: 'A$' },
  { code: 'nzd', label: 'NZD - New Zealand Dollar', symbol: 'NZ$' },
  { code: 'jpy', label: 'JPY - Japanese Yen', symbol: '¥' },
  { code: 'inr', label: 'INR - Indian Rupee', symbol: '₹' },
  { code: 'sgd', label: 'SGD - Singapore Dollar', symbol: 'S$' },
  { code: 'hkd', label: 'HKD - Hong Kong Dollar', symbol: 'HK$' },
  { code: 'chf', label: 'CHF - Swiss Franc', symbol: 'CHF' },
  { code: 'sek', label: 'SEK - Swedish Krona', symbol: 'kr' },
  { code: 'nok', label: 'NOK - Norwegian Krone', symbol: 'kr' },
  { code: 'dkk', label: 'DKK - Danish Krone', symbol: 'kr' },
  { code: 'aed', label: 'AED - UAE Dirham', symbol: 'د.إ' },
  { code: 'brl', label: 'BRL - Brazilian Real', symbol: 'R$' },
  { code: 'mxn', label: 'MXN - Mexican Peso', symbol: 'MX$' },
  { code: 'zar', label: 'ZAR - South African Rand', symbol: 'R' },
]

const SUPPORTED_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code))

// Stripe zero-decimal currencies: the smallest unit IS the whole number, so the
// charge amount is NOT multiplied by 100. Getting this wrong over/under-charges
// by 100x, so it's the load-bearing piece of multi-currency.
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
])

export const DEFAULT_CURRENCY = 'usd'

/** Normalize an arbitrary value to a supported lowercase currency code (default usd). */
export function normalizeCurrency(value: string | null | undefined): string {
  const code = (value || '').trim().toLowerCase()
  return SUPPORTED_CODES.has(code) ? code : DEFAULT_CURRENCY
}

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has((currency || '').toLowerCase())
}

/**
 * Convert a human amount (e.g. 50, 19.99, 1000) into the Stripe "smallest unit"
 * amount for the given currency: ×100 for normal currencies, as-is (rounded) for
 * zero-decimal currencies like JPY/KRW.
 */
export function toStripeAmount(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return isZeroDecimalCurrency(currency) ? Math.round(amount) : Math.round(amount * 100)
}

/** Convert a Stripe smallest-unit amount back to the human (major) amount. */
export function toMajorAmount(smallestUnitAmount: number, currency: string): number {
  return isZeroDecimalCurrency(normalizeCurrency(currency)) ? smallestUnitAmount : smallestUnitAmount / 100
}

/**
 * Convert an amount stored in the app's 2-decimal "minor unit" convention (always
 * major × 100 regardless of currency - how negotiation `amount_cents` and parsed
 * budgets are recorded) into the Stripe smallest-unit charge amount for `currency`.
 * No-op for 2-decimal currencies; divides by 100 for zero-decimal currencies so an
 * amount stored as 100000 charges ¥1,000, not ¥100,000 (the 100x over-charge bug).
 */
export function minorToStripeAmount(minorUnits: number, currency: string | null | undefined): number {
  if (!Number.isFinite(minorUnits) || minorUnits <= 0) return 0
  // Pass the raw code straight to toStripeAmount (which keys off isZeroDecimalCurrency
  // directly, like the direct-checkout path) rather than normalizeCurrency - the
  // zero-decimal set is broader than the curated SUPPORTED list (e.g. KRW), and an
  // unrecognized code safely defaults to 2-decimal (×100).
  return toStripeAmount(minorUnits / 100, currency ?? '')
}

/** Format a smallest-unit amount + currency for display (locale-aware). */
export function formatCurrencyAmount(smallestUnitAmount: number, currency: string): string {
  const code = normalizeCurrency(currency)
  const major = isZeroDecimalCurrency(code) ? smallestUnitAmount : smallestUnitAmount / 100
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code.toUpperCase(),
      maximumFractionDigits: isZeroDecimalCurrency(code) ? 0 : Number.isInteger(major) ? 0 : 2,
    }).format(major)
  } catch {
    return `${major} ${code.toUpperCase()}`
  }
}

