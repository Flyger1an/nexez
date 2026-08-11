// Every Inngest function the serve route registers. New background jobs (the
// batch-scan harness, future email/report jobs) get added here.

import { dispatchOutboundWebhooks } from './outbound-webhooks'
import { processFreshnessNudge } from './freshness-nudge'
import { regenerateFeeds } from './feed-regenerate'

export const inngestFunctions = [dispatchOutboundWebhooks, processFreshnessNudge, regenerateFeeds]
