import { NextResponse } from 'next/server'

// Lightweight in-memory fixed-window rate limiter. Per serverless instance
// (not globally shared), but enough to blunt abuse/bursts on public routes.
// For strict global limits, back this with Upstash/Redis later.

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
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Enforce a rate limit for a route. Returns a 429 NextResponse when exceeded,
 * or null to proceed. Use at the top of a route handler.
 */
export function enforceRateLimit(
  request: Request,
  route: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const res = rateLimit(`${route}:${clientIp(request)}`, limit, windowMs)
  if (res.ok) return null
  return NextResponse.json(
    { error: 'Rate limit exceeded. Please slow down.', retryAfter: res.retryAfter },
    { status: 429, headers: { 'Retry-After': String(res.retryAfter) } },
  )
}

// Layered quotas for the negotiation POST endpoint. The blunt 20/min/IP limit
// couldn't distinguish "one busy agent on one page" from "a swarm hammering one
// page from many IPs". Tunable; in-memory + per-instance (same caveat as above).
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
 * real guards. Back with Upstash/Redis for globally-shared limits later.
 */
export function enforceNegotiationRateLimit(
  request: Request,
  ctx: { slug?: string; buyerAgent?: string },
  now: number = Date.now(),
): NextResponse | null {
  const ip = clientIp(request)
  const slug = (ctx.slug || 'unknown').toLowerCase().slice(0, 120)
  const agent = (ctx.buyerAgent || 'anonymous').toLowerCase().slice(0, 120)

  const tripped = [
    rateLimit(`neg:ip:${ip}`, NEGOTIATION_RATE_LIMITS.ip.limit, NEGOTIATION_RATE_LIMITS.ip.windowMs, now),
    rateLimit(`neg:page:${slug}`, NEGOTIATION_RATE_LIMITS.page.limit, NEGOTIATION_RATE_LIMITS.page.windowMs, now),
    rateLimit(`neg:agent:${slug}:${agent}`, NEGOTIATION_RATE_LIMITS.agent.limit, NEGOTIATION_RATE_LIMITS.agent.windowMs, now),
  ].filter((r) => !r.ok)

  if (tripped.length === 0) return null

  const retryAfter = Math.max(...tripped.map((r) => r.retryAfter))
  return NextResponse.json(
    { error: 'Rate limit exceeded. Please slow down.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}
