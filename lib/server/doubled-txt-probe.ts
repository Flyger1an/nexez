import 'server-only'
import dns from 'dns'
import { promisify } from 'util'
import { doubledVerificationTxtCandidates, doubledRecordMessage } from '../website-verification'

const resolveTxt = promisify(dns.resolveTxt)

/**
 * Look for the expected token at any zone-appended ("doubled") variant of the
 * verification record name. Returns the ready-to-show guidance naming the exact
 * Host/Name value to use, or null when nothing matches.
 *
 * Candidates are probed most-specific-zone first, so a site on a subdomain
 * resolves to the right label (`_nexez-verify.shop`) rather than the apex one.
 */
export async function findDoubledRecordMessage(host: string, expected: string): Promise<string | null> {
  if (!host || !expected) return null
  for (const { doubledHost, zone } of doubledVerificationTxtCandidates(host)) {
    try {
      const records = await resolveTxt(doubledHost)
      const flat = records.map((chunks) => chunks.join('').trim())
      if (flat.some((value) => value === expected)) return doubledRecordMessage(host, zone)
    } catch {
      // NXDOMAIN/NODATA for this candidate: try the next parent zone.
    }
  }
  return null
}
