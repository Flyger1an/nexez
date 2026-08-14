// Inngest serve endpoint: the Inngest platform calls this route to discover and
// execute the registered functions. Requests are signature-verified with
// INNGEST_SIGNING_KEY (no session involved). Unlisted /api/* routes are
// private-by-default in lib/site.ts, so this is canonical on the APP host:
// register the app against https://app.nexez.ai/api/inngest.

import { serve } from 'inngest/next'
import { inngest } from '../../../lib/inngest/client'
import { inngestFunctions } from '../../../lib/inngest/functions'

export const { GET, POST, PUT } = serve({ client: inngest, functions: inngestFunctions })

// Steps execute as individual invocations of this route; give slower steps
// (external fetches, email sends) the same headroom as the freshness cron.
export const maxDuration = 60
