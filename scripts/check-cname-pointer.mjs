#!/usr/bin/env node

import dns from 'node:dns/promises'

/**
 * Merchant custom domains are told to CNAME to a Nexez-branded hostname
 * (`cname.nexez.app`) rather than the raw hosting-provider target, so no
 * merchant ever sees the provider in their DNS panel.
 *
 * That pointer is a record we maintain BY HAND. Our own platform hostnames
 * (e.g. `www.nexez.app`) are managed by the provider and follow automatically
 * if the project is ever moved to a different DNS shard. The hand-made pointer
 * does not. If that happens, `cname.nexez.app` silently keeps aiming at a stale
 * target and EVERY merchant custom domain breaks at once, with no deploy, no
 * error, and nothing in the logs to explain it.
 *
 * This check compares the pointer against the provider-managed reference and
 * fails loudly on drift. It is deliberately dependency-free and read-only.
 */

const DEFAULT_POINTER = process.env.NEXEZ_CNAME_POINTER || 'cname.nexez.app'
// A platform hostname the provider manages, used as the source of truth for
// what the pointer should currently be aiming at.
const DEFAULT_REFERENCE = process.env.NEXEZ_CNAME_REFERENCE || 'www.nexez.app'

async function cnameTargetOf(host) {
  try {
    const records = await dns.resolveCname(host)
    return records[0] || null
  } catch (error) {
    if (error?.code === 'ENOTFOUND' || error?.code === 'ENODATA') return null
    throw error
  }
}

async function addressesOf(host) {
  try {
    return await dns.resolve4(host)
  } catch (error) {
    if (error?.code === 'ENOTFOUND' || error?.code === 'ENODATA') return []
    throw error
  }
}

/**
 * @returns {Promise<{ ok: boolean, message: string, pointer: string, pointerTarget: string|null, referenceTarget: string|null, addresses: string[] }>}
 */
export async function checkCnamePointer({
  pointer = DEFAULT_POINTER,
  reference = DEFAULT_REFERENCE,
} = {}) {
  const [pointerTarget, referenceTarget] = await Promise.all([
    cnameTargetOf(pointer),
    cnameTargetOf(reference),
  ])
  const addresses = await addressesOf(pointer)
  const base = { pointer, pointerTarget, referenceTarget, addresses }

  // 1. The pointer must exist as a CNAME at all. Missing means every merchant
  //    domain pointed at it is already dead.
  if (!pointerTarget) {
    return {
      ...base,
      ok: false,
      message:
        `${pointer} does not resolve as a CNAME. Every merchant custom domain pointing at it is broken. ` +
        `Recreate it aiming at ${referenceTarget || "the provider's current target"}.`,
    }
  }

  // 2. A CNAME that resolves to no addresses is dangling: the name exists but
  //    serves nothing, which fails exactly like a missing record for merchants.
  if (addresses.length === 0) {
    return {
      ...base,
      ok: false,
      message: `${pointer} is a CNAME to ${pointerTarget} but resolves to no addresses (dangling target).`,
    }
  }

  // 3. The drift case this monitor exists for. If the reference cannot be read
  //    we cannot compare, so report rather than pass silently.
  if (!referenceTarget) {
    return {
      ...base,
      ok: false,
      message:
        `Could not read the provider-managed target from ${reference}, so ${pointer} could not be verified. ` +
        `Check ${reference} manually.`,
    }
  }

  if (pointerTarget.toLowerCase() !== referenceTarget.toLowerCase()) {
    return {
      ...base,
      ok: false,
      message:
        `DRIFT: ${pointer} points at ${pointerTarget} but the provider now serves ${reference} from ` +
        `${referenceTarget}. Update the ${pointer} CNAME to ${referenceTarget} or every merchant custom ` +
        `domain will break.`,
    }
  }

  return {
    ...base,
    ok: true,
    message: `${pointer} -> ${pointerTarget} matches ${reference}, resolving to ${addresses.join(', ')}.`,
  }
}

// Standalone: `node scripts/check-cname-pointer.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkCnamePointer()
  console.log(result.ok ? `OK   ${result.message}` : `FAIL ${result.message}`)
  if (!result.ok) process.exitCode = 1
}
