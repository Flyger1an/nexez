import { DEFAULT_CURRENCY, normalizeReportingCurrency } from './currency'

export const DEFAULT_DISPLAY_LOCALE = 'en-US'
export const FINANCE_TIME_ZONE = 'UTC'

type DateValue = Date | string | number

type InternationalOperationsInput = {
  settlementCurrencies: Array<string | null | undefined>
  accountCountry?: string | null
  defaultPayoutCurrency?: string | null
  locale?: string | null
}

export type InternationalOperationsSummary = {
  locale: string
  settlementCurrencies: string[]
  multiCurrency: boolean
  accountCountryCode: string | null
  accountCountryLabel: string | null
  defaultPayoutCurrency: string | null
  hasPotentialPayoutConversion: boolean
  conversionMode: 'not_performed'
  taxMode: 'not_calculated'
}

/** Resolve the highest-priority valid language tag from an Accept-Language value.
 * This is presentation only. It never changes prices, currencies, taxes, or routes. */
export function resolveDisplayLocale(value: string | null | undefined): string {
  if (!value) return DEFAULT_DISPLAY_LOCALE
  const candidates = value
    .slice(0, 512)
    .split(',')
    .map((part, index) => {
      const [rawTag, ...parameters] = part.trim().split(';')
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='))
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1
      return { tag: rawTag.trim(), quality: Number.isFinite(quality) ? quality : 0, index }
    })
    .filter((candidate) => candidate.tag && candidate.tag !== '*' && candidate.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)

  for (const candidate of candidates) {
    try {
      const [canonical] = Intl.getCanonicalLocales(candidate.tag)
      if (canonical) return canonical
    } catch {
      // Ignore malformed request values and continue to the next preference.
    }
  }
  return DEFAULT_DISPLAY_LOCALE
}

export function formatDisplayDate(
  value: DateValue,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return new Intl.DateTimeFormat(resolveDisplayLocale(locale), {
    timeZone: FINANCE_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(date)
}

export function formatDisplayDateTime(value: DateValue, locale: string): string {
  return formatDisplayDate(value, locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function buildInternationalOperationsSummary(
  input: InternationalOperationsInput,
): InternationalOperationsSummary {
  const locale = resolveDisplayLocale(input.locale)
  const settlementCurrencies = Array.from(new Set(
    input.settlementCurrencies
      .filter((currency): currency is string => typeof currency === 'string' && Boolean(currency.trim()))
      .map(normalizeReportingCurrency),
  ))
  const defaultPayoutCurrency = input.defaultPayoutCurrency
    ? normalizeReportingCurrency(input.defaultPayoutCurrency)
    : null
  const accountCountryCode = normalizeCountryCode(input.accountCountry)

  return {
    locale,
    settlementCurrencies,
    multiCurrency: settlementCurrencies.length > 1,
    accountCountryCode,
    accountCountryLabel: accountCountryCode ? displayCountryName(accountCountryCode, locale) : null,
    defaultPayoutCurrency,
    hasPotentialPayoutConversion: Boolean(
      defaultPayoutCurrency
      && settlementCurrencies.some((currency) => currency !== defaultPayoutCurrency),
    ),
    conversionMode: 'not_performed',
    taxMode: 'not_calculated',
  }
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  const code = (value || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function displayCountryName(countryCode: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(countryCode) || countryCode
  } catch {
    return countryCode
  }
}

export function displayCurrencyCode(value: string | null | undefined): string {
  return normalizeReportingCurrency(value || DEFAULT_CURRENCY).toUpperCase()
}
