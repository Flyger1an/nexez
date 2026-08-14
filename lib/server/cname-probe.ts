import 'server-only'
import dns from 'dns'
import { promisify } from 'util'

const resolveCname = promisify(dns.resolveCname)

const normalizeTarget = (value: string) => value.trim().toLowerCase().replace(/\.$/, '')

/**
 * Confirm that a subdomain publishes the exact CNAME target Nexez requested.
 * Vercel's `configuredBy` value is informational and is not stable enough to
 * serve as DNS proof by itself, so the final reconciliation checks DNS too.
 */
export async function hasExpectedCname(host: string, expectedTarget: string): Promise<boolean> {
  if (!host || !expectedTarget) return false
  try {
    const expected = normalizeTarget(expectedTarget)
    const records = await resolveCname(host)
    return records.some((record) => normalizeTarget(record) === expected)
  } catch {
    return false
  }
}
