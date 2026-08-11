// Inngest client + env gate: the durable job runner for Nexez background work
// (webhook fan-out, freshness nudges, feed regeneration; the batch-scan harness
// plugs in here too). Dormant like the other gated integrations: without
// INNGEST_EVENT_KEY, hasInngestEnv() is false and every emitter keeps its
// inline fallback path, so nothing changes before the keys are set in Vercel.
//
// Serve endpoint: app/api/inngest/route.ts. Unlisted /api/* routes are
// private-by-default (see canonicalHostFor in lib/site.ts), so the endpoint is
// canonical on the APP host: register the Inngest app against
// https://app.nexez.ai/api/inngest (signature-verified via INNGEST_SIGNING_KEY,
// no session required).

import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'nexez' })

/** True when events can actually be sent to Inngest (event key present).
 *  The serve route additionally needs INNGEST_SIGNING_KEY in production. */
export function hasInngestEnv(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY)
}
