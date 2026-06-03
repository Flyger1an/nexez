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
