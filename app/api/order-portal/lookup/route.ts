import { NextResponse, after } from 'next/server'
import { createHash } from 'crypto'
import { findOrdersByEmail } from '../../../../lib/server/load-order'
import { signLookupToken } from '../../../../lib/server/order-lookup-token'
import { buildOrderLookupEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { getBaseUrl } from '../../../../lib/agent-page'
import { enforceRateLimit, rateLimitShared } from '../../../../lib/rate-limit'

/**
 * "Find my orders" email lookup. A buyer enters their email; if it has orders, we
 * email a single signed, 24h-expiring magic link to their order list. Security:
 *  - ALWAYS returns the same neutral response (never reveals whether an email has
 *    orders — anti-enumeration);
 *  - email is sent ONLY when orders actually match (a non-customer address gets
 *    nothing), and only to that address;
 *  - IP rate-limit (hard) + per-email rate-limit (skips the send, stays neutral) to
 *    stop inbox-bombing a victim.
 * Token + DB read run in after() so response timing is constant.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const NEUTRAL = { ok: true, message: "If that email has orders with us, we've sent you a link to view them." }

export async function POST(request: Request) {
  // Hard IP throttle (a 429 here leaks nothing about order existence).
  const limited = await enforceRateLimit(request, 'order-lookup', 5, 60_000)
  if (limited) return limited

  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const email = String(body.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })

  // Everything past here returns the SAME neutral response regardless of outcome.
  if (EMAIL_RE.test(email) && hasEmailEnv()) {
    // Per-email cap (keyed on a hash, never the raw address) — bound how often any one
    // inbox can be mailed, defeating bombing even across rotating IPs. On exceed we
    // simply skip the send and still return neutral.
    const emailKey = createHash('sha256').update(email).digest('hex').slice(0, 32)
    const perEmail = await rateLimitShared(`order-lookup:email:${emailKey}`, 3, 15 * 60_000)
    if (perEmail.ok) {
      after(async () => {
        const orders = await findOrdersByEmail(email)
        if (!orders.length) return // never email a non-customer address
        const token = signLookupToken(email)
        if (!token) return
        const mail = buildOrderLookupEmail({ count: orders.length, findUrl: `${getBaseUrl()}/orders/find/${token}` })
        await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text })
      })
    }
  }

  return NextResponse.json(NEUTRAL)
}
