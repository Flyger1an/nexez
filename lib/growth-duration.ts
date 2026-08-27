/**
 * Translate a fixed grant duration into the contractual phrase shown in merchant
 * email. This lives outside the route module because Next.js route files may only
 * export HTTP handlers and supported route configuration.
 */
export function describeGrantDuration(days: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  const spell = (value: number) => (value < words.length ? words[value] : String(value))
  if (!Number.isFinite(days) || days <= 0) return 'your complimentary period'
  if (days % 365 === 0) {
    const years = days / 365
    return years === 1 ? 'one year' : `${spell(years)} years`
  }
  if (days % 30 === 0) {
    const months = days / 30
    return months === 1 ? 'one month' : `${spell(months)} months`
  }
  return days === 1 ? 'one day' : `${days} days`
}
