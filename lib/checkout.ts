export function parseMoney(value: string | null | undefined) {
  if (!value) return null

  const match = value.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]{1,2})?)/)
  return match ? Number(match[1]) : null
}

export function parseMoneyCents(value: string | null | undefined) {
  const dollars = parseMoney(value)
  return dollars ? Math.round(dollars * 100) : null
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

export function formatUsdCents(value: number) {
  return formatUsd(value / 100)
}

export function toStripeDescription(value: string | null | undefined) {
  if (!value) return undefined
  return value.length > 500 ? `${value.slice(0, 497)}...` : value
}
