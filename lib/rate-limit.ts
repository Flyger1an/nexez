import { NextResponse } from 'next/server'

// Fixed-window rate limiter. Two backends, same RateResult contract:
//  - `rateLimit`: in-memory, per serverless instance (the always-available fallback).
//  - `rateLimitShared`: backed by Upstash Redis / Vercel KV REST when configured,
//    making limits GLOBAL across instances (closes the per-instance bypass).
// The `enforce*` helpers use the shared backend (which falls back to in-memory when
// no store is configured), so callers get global limits the moment the env is set.

type Bucket = { count: number; reset: number }
const buckets = new Map<string, Bucket>()

export type RateResult = { ok: boolean; remaining: number; retryAfter: number; limit: number }

export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateResult {
  const b = buckets.get(key)
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfter: 0, limit }
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)), limit }
  }
  b.count += 1
  return { ok: true, remaining: limit - b.count, retryAfter: 0, limit }
}

/** Best-effort client identity from proxy headers (falls back to a constant). */
export function clientIp(request: Request): string {
  // Prefer headers the trusted proxy sets to the *verified* client IP. The raw
  // X-Forwarded-For chain is partly client-controlled: a client can prepend
  // arbitrary entries, and Vercel appends the real IP as the LAST entry. So
  // never trust the first XFF entry — use cf-connecting-ip / x-real-ip first,
  // and if we must read XFF, take the last (proxy-appended) entry.
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',')
    return parts[parts.length - 1]!.trim()
  }
  return 'unknown'
}

// Optional shared backing store (Upstash Redis / Vercel KV REST). When configured,
// limits are GLOBAL across serverless instances — closing the per-instance bypass
// where caps aren't coherent and cold instances reset the window. When NOT
// configured, the in-memory `rateLimit` is used transparently, so dev/test and
// un-provisioned deploys keep working unchanged. Errors fail OPEN (to the in-memory
// limiter) — a Redis outage must never take down a route.
function redisRestConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  return url && token ? { url, token } : null
}

function numResult(entry: unknown): number | null {
  const r = (entry as { result?: unknown } | null)?.result
  return typeof r === 'number' ? r : null
}

/**
 * Fixed-window counter backed by Redis (Upstash/KV REST), with the same
 * RateResult contract as `rateLimit`. Atomic per key: INCR, set the window TTL
 * only on the first hit (PEXPIRE … NX), and read the remaining TTL for Retry-After.
 * Falls back to the in-memory limiter when unconfigured or on any error.
 */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): Promise<RateResult> {
  const cfg = redisRestConfig()
  if (!cfg) return rateLimit(key, limit, windowMs, now)
  const rk = `rl:${key}`
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', rk],
        ['PEXPIRE', rk, String(windowMs), 'NX'],
        ['PTTL', rk],
      ]),
      cache: 'no-store',
    })
    if (!res.ok) return rateLimit(key, limit, windowMs, now)
    const data = (await res.json()) as unknown[]
    const count = numResult(data?.[0])
    if (count === null) return rateLimit(key, limit, windowMs, now)
    if (count > limit) {
      const pttl = numResult(data?.[2])
      const retryAfter = pttl && pttl > 0 ? Math.ceil(pttl / 1000) : Math.ceil(windowMs / 1000)
      return { ok: false, remaining: 0, retryAfter, limit }
    }
    return { ok: true, remaining: Math.max(0, limit - count), retryAfter: 0, limit }
  } catch {
    return rateLimit(key, limit, windowMs, now) // fail open to the in-memory limiter
  }
}

function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Rate limit exceeded. Please slow down.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

/**
 * Enforce a rate limit for a route. Returns a 429 NextResponse when exceeded,
 * or null to proceed. Use at the top of a route handler (with `await`).
 */
export async function enforceRateLimit(
  request: Request,
  route: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const res = await rateLimitShared(`${route}:${clientIp(request)}`, limit, windowMs)
  return res.ok ? null : tooManyRequests(res.retryAfter)
}

// Layered quotas for the negotiation POST endpoint. The blunt 20/min/IP limit
// couldn't distinguish "one busy agent on one page" from "a swarm hammering one
// page from many IPs". Tunable; global when a shared store is configured.
export const NEGOTIATION_RATE_LIMITS = {
  ip: { limit: 30, windowMs: 60_000 }, // the real abuse guard
  page: { limit: 60, windowMs: 60_000 }, // one page can't be saturated across many IPs
  agent: { limit: 12, windowMs: 60_000 }, // a single named agent's share of one page
} as const

/**
 * Enforce the layered negotiation quotas. 429s if ANY of the per-IP, per-page, or
 * per-agent+page windows is exceeded (max retryAfter of the tripped ones), else
 * returns null to proceed.
 *
 * `buyerAgent` is buyer-supplied and therefore spoofable, so its bucket is a
 * fairness/cost guard — NOT a security control. The IP and page buckets are the
 * real guards, and become globally-shared once a Redis/KV store is configured.
 */
export async function enforceNegotiationRateLimit(
  request: Request,
  ctx: { slug?: string; buyerAgent?: string },
  now: number = Date.now(),
): Promise<NextResponse | null> {
  const ip = clientIp(request)
  const slug = (ctx.slug || 'unknown').toLowerCase().slice(0, 120)
  const agent = (ctx.buyerAgent || 'anonymous').toLowerCase().slice(0, 120)

  const results = await Promise.all([
    rateLimitShared(`neg:ip:${ip}`, NEGOTIATION_RATE_LIMITS.ip.limit, NEGOTIATION_RATE_LIMITS.ip.windowMs, now),
    rateLimitShared(`neg:page:${slug}`, NEGOTIATION_RATE_LIMITS.page.limit, NEGOTIATION_RATE_LIMITS.page.windowMs, now),
    rateLimitShared(`neg:agent:${slug}:${agent}`, NEGOTIATION_RATE_LIMITS.agent.limit, NEGOTIATION_RATE_LIMITS.agent.windowMs, now),
  ])
  const tripped = results.filter((r) => !r.ok)
  if (tripped.length === 0) return null

  const retryAfter = Math.max(...tripped.map((r) => r.retryAfter))
  return tooManyRequests(retryAfter)
}
