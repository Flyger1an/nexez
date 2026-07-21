export type LaunchStatus = 'ready' | 'attention' | 'blocked' | 'unknown'

export type LaunchCheck = {
  id: string
  label: string
  detail: string
  evidence: string
  status: LaunchStatus
  required: boolean
  action?: string
}

export type LaunchConfigurationInput = {
  supabasePublic: boolean
  supabaseAdmin: boolean
  stripeMode: 'live' | 'test' | 'unknown'
  stripeWebhooks: boolean
  stripeConnectWebhook: boolean
  priceIdsConfigured: number
  priceIdsExpected: number
  priceIdsInvalid: number
  stripeCatalogVerified: boolean | null
  stripeCatalogDetail: string
  actionApprovalSecret: boolean
  actionApprovalRequired: boolean
  releaseCertificationSecret: boolean
  cronSecret: boolean
  email: boolean
  observability: boolean
  integrationEncryption: boolean
  llm: boolean
  hostsAligned: boolean
}

export type LaunchSourceAvailability = {
  stripeWebhooks: boolean
  checkoutEvents: boolean
  orders: boolean
  negotiations: boolean
  billing: boolean
  shopify: boolean
  outboundWebhooks: boolean
  support: boolean
  checkoutSessions: boolean
}

export type LaunchMetrics = {
  stripeWebhookEvents: number
  latestStripeWebhookAt: string | null
  stripePriceWebhookEvents: number
  stripePriceSyncEvents: number
  checkoutStripeErrors24h: number
  checkoutOrders: number
  directOrders: number
  paidOrders: number
  refundedOrders: number
  disputedOrders: number
  protocolOrders: number
  sandboxProtocolOrders: number
  acpProtocolOrders: number
  ucpProtocolOrders: number
  negotiations: number
  pendingNegotiationDecisions: number
  staleNegotiationDecisions: number
  completedNegotiations: number
  heldNegotiations: number
  paymentBackedNegotiations: number
  refundedNegotiations: number
  activeSubscriptions: number
  subscriptionRecords: number
  connectChargeReady: number
  connectPayoutReady: number
  shopifyInstalls: number
  shopifyPending: number
  shopifyStale: number
  shopifyErrors: number
  activeOutboundWebhooks: number
  failedOutboundWebhooks: number
  urgentSupportTickets: number
  expiredCheckoutSessions: number
}

export type LaunchIncident = {
  id: string
  title: string
  detail: string
  occurredAt: string | null
  status: Exclude<LaunchStatus, 'ready'>
  href?: string
}

export type LaunchSummary = {
  status: LaunchStatus
  score: number
  ready: number
  attention: number
  blocked: number
  unknown: number
}

export type LaunchControlSnapshot = {
  generatedAt: string
  environment: {
    stripeMode: LaunchConfigurationInput['stripeMode']
    marketingHost: string
    appHost: string
    agentHost: string
  }
  configuration: LaunchCheck[]
  operations: LaunchCheck[]
  certification: LaunchCheck[]
  summary: LaunchSummary
  metrics: LaunchMetrics
  sources: LaunchSourceAvailability
  incidents: LaunchIncident[]
}

type MarketplaceCurationSignal = {
  available: boolean
  summary: {
    total: number
    unreviewed: number
    candidate: number
    certified: number
    excluded: number
  }
}

const READY_WEIGHT: Record<LaunchStatus, number> = {
  ready: 1,
  attention: 0.55,
  unknown: 0.25,
  blocked: 0,
}

const STRIPE_CATALOG_SYNC_EVENT_TYPES = new Set([
  'price.created',
  'price.updated',
  'product.updated',
])

export function isStripeCatalogSyncEvent(type: string | null): boolean {
  return type != null && STRIPE_CATALOG_SYNC_EVENT_TYPES.has(type)
}

const SETTLED_ORDER_STATUSES = new Set(['paid', 'refunded', 'disputed'])

export function isSettledProtocolOrder(order: {
  channel: string | null
  status: string
  stripe_livemode: boolean | null
}): boolean {
  return order.stripe_livemode != null
    && (order.channel === 'acp' || order.channel === 'ucp')
    && SETTLED_ORDER_STATUSES.has(order.status)
}

export function buildConfigurationChecks(input: LaunchConfigurationInput): LaunchCheck[] {
  const priceCountReady = input.priceIdsConfigured === input.priceIdsExpected && input.priceIdsInvalid === 0
  const catalogStatus: LaunchStatus = input.stripeCatalogVerified === true
    ? 'ready'
    : input.stripeCatalogVerified === false
      ? 'blocked'
      : priceCountReady
        ? 'attention'
        : 'blocked'

  return [
    {
      id: 'supabase',
      label: 'Core data access',
      detail: 'Public requests use the publishable key; privileged jobs use the server-only service role.',
      evidence: input.supabasePublic && input.supabaseAdmin
        ? 'Public and service-role configuration detected.'
        : 'One or more required Supabase settings are missing.',
      status: input.supabasePublic && input.supabaseAdmin ? 'ready' : 'blocked',
      required: true,
      action: 'Set the Supabase URL, publishable key, and service-role key in the production environment.',
    },
    {
      id: 'stripe-rails',
      label: 'Stripe transaction rails',
      detail: 'The platform key and both webhook secrets must agree on the same Stripe mode.',
      evidence: input.stripeMode === 'live'
        ? 'Live Stripe key detected with account and Connect webhook secrets.'
        : input.stripeMode === 'test'
          ? 'Test-mode Stripe key detected.'
          : 'Stripe mode could not be determined.',
      status: input.stripeMode === 'unknown' || !input.stripeWebhooks || !input.stripeConnectWebhook
        ? 'blocked'
        : input.stripeMode === 'test'
          ? 'attention'
          : 'ready',
      required: true,
      action: 'Configure the live Stripe key plus separate account and connected-account webhook secrets.',
    },
    {
      id: 'stripe-catalog',
      label: 'Subscription price catalog',
      detail: 'Launch, Pro, and Scale must point to active recurring Prices in the same Stripe mode as the key.',
      evidence: input.stripeCatalogDetail,
      status: catalogStatus,
      required: true,
      action: 'Open each Stripe product, copy its active recurring Price ID, update the matching STRIPE_PRICE_* setting, and redeploy.',
    },
    {
      id: 'approval-safety',
      label: 'Buyer approval enforcement',
      detail: 'Checkout and negotiation actions require a short-lived, payload-bound approval token.',
      evidence: input.actionApprovalSecret && input.actionApprovalRequired
        ? 'Signing secret and mandatory enforcement are active.'
        : 'The signing secret or mandatory enforcement flag is missing.',
      status: input.actionApprovalSecret && input.actionApprovalRequired ? 'ready' : 'blocked',
      required: true,
      action: 'Set NEXEZ_ACTION_APPROVAL_SECRET and NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN=true, then redeploy.',
    },
    {
      id: 'release-certification',
      label: 'Release certification ingress',
      detail: 'The post-deploy verifier writes signed, append-only evidence without exposing operational state publicly.',
      evidence: input.releaseCertificationSecret
        ? 'A dedicated release-certification secret is configured.'
        : 'The release-certification endpoint is dormant.',
      status: input.releaseCertificationSecret ? 'ready' : 'blocked',
      required: true,
      action: 'Set the same 32-byte NEXEZ_RELEASE_CERT_SECRET in production and GitHub Actions, then redeploy.',
    },
    {
      id: 'background-jobs',
      label: 'Background job authorization',
      detail: 'Reconciliation, negotiation processing, freshness, and integration workers fail closed behind one secret.',
      evidence: input.cronSecret ? 'Cron authorization is configured.' : 'Cron authorization is not configured.',
      status: input.cronSecret ? 'ready' : 'blocked',
      required: true,
      action: 'Set CRON_SECRET in production before enabling scheduled jobs.',
    },
    {
      id: 'transaction-email',
      label: 'Transaction email',
      detail: 'Receipts, negotiation notices, and money-state updates need a verified sender.',
      evidence: input.email ? 'Email provider and sender are configured.' : 'Email delivery is dormant.',
      status: input.email ? 'ready' : 'attention',
      required: true,
      action: 'Configure RESEND_API_KEY and EMAIL_FROM on a verified domain.',
    },
    {
      id: 'integration-encryption',
      label: 'Integration credential encryption',
      detail: 'Stored Calendly and Shopify credentials require a valid 32-byte encryption key.',
      evidence: input.integrationEncryption ? 'Credential encryption is active.' : 'Stored-credential integrations are dormant.',
      status: input.integrationEncryption ? 'ready' : 'attention',
      required: true,
      action: 'Set a valid INTEGRATION_SECRET_KEY and keep it stable across deploys.',
    },
    {
      id: 'observability',
      label: 'Operational alerting',
      detail: 'Runtime errors and worker events should leave the platform through the configured drain.',
      evidence: input.observability ? 'Observability drain is configured.' : 'Only function logs will receive errors.',
      status: input.observability ? 'ready' : 'attention',
      required: true,
      action: 'Configure OBSERVABILITY_WEBHOOK_URL and its token.',
    },
    {
      id: 'platform-hosts',
      label: 'Three-host routing',
      detail: 'Marketing, authenticated management, and agent runtime must stay on their intended hosts.',
      evidence: input.hostsAligned
        ? 'nexez.ai, app.nexez.ai, and nexez.app resolve to their intended roles.'
        : 'One or more canonical host settings do not match the production architecture.',
      status: input.hostsAligned ? 'ready' : 'blocked',
      required: true,
      action: 'Correct the public host environment settings before the next production deploy.',
    },
    {
      id: 'llm',
      label: 'LLM assistance',
      detail: 'Copilot and assisted negotiation can run deterministically without a model, but launch quality improves with one.',
      evidence: input.llm ? 'An LLM provider is configured.' : 'AI-enhanced paths will use deterministic fallbacks.',
      status: input.llm ? 'ready' : 'attention',
      required: false,
      action: 'Configure LLM_API_KEY when enhanced assistance is part of the launch offer.',
    },
  ]
}

export function buildOperationalChecks(
  metrics: LaunchMetrics,
  sources: LaunchSourceAvailability,
  nowIso: string,
): LaunchCheck[] {
  const webhookAgeHours = ageHours(metrics.latestStripeWebhookAt, nowIso)
  const webhookStatus: LaunchStatus = !sources.stripeWebhooks
    ? 'unknown'
    : metrics.stripeWebhookEvents === 0 || webhookAgeHours == null
      ? 'attention'
      : webhookAgeHours > 24 * 7
        ? 'blocked'
        : webhookAgeHours > 72
          ? 'attention'
          : 'ready'

  const workerStatus: LaunchStatus = !sources.negotiations
    ? 'unknown'
    : metrics.staleNegotiationDecisions > 0
      ? 'blocked'
      : metrics.pendingNegotiationDecisions > 20
        ? 'attention'
        : 'ready'

  const shopifyStatus: LaunchStatus = !sources.shopify
    ? 'unknown'
    : metrics.shopifyErrors > 0
      ? 'blocked'
      : metrics.shopifyStale > 0 || metrics.shopifyPending > 10
        ? 'attention'
        : 'ready'

  const checkoutErrorStatus: LaunchStatus = !sources.checkoutEvents
    ? 'unknown'
    : metrics.checkoutStripeErrors24h >= 3
      ? 'blocked'
      : metrics.checkoutStripeErrors24h > 0
        ? 'attention'
        : 'ready'

  return [
    {
      id: 'stripe-delivery',
      label: 'Stripe event delivery',
      detail: 'The idempotency ledger proves signed events are reaching and completing the webhook handler.',
      evidence: !sources.stripeWebhooks
        ? 'Stripe event ledger is unavailable.'
        : metrics.latestStripeWebhookAt
          ? `${metrics.stripeWebhookEvents} recorded events; latest ${relativeAge(metrics.latestStripeWebhookAt, nowIso)}.`
          : 'No Stripe events are recorded.',
      status: webhookStatus,
      required: true,
      action: 'Inspect Stripe endpoint deliveries and the production webhook signing secrets.',
    },
    {
      id: 'checkout-errors',
      label: 'Checkout error pressure',
      detail: 'Recent Stripe errors are counted independently from normal validation and provider handoffs.',
      evidence: sources.checkoutEvents
        ? `${metrics.checkoutStripeErrors24h} Stripe checkout errors in the last 24 hours.`
        : 'Checkout telemetry is unavailable.',
      status: checkoutErrorStatus,
      required: true,
      action: 'Inspect recent checkout incidents, seller Connect readiness, and Stripe request logs.',
    },
    {
      id: 'negotiation-worker',
      label: 'Negotiation decision worker',
      detail: 'The five-minute worker must clear any decision that outlives its normal asynchronous window.',
      evidence: sources.negotiations
        ? `${metrics.pendingNegotiationDecisions} pending; ${metrics.staleNegotiationDecisions} older than 10 minutes.`
        : 'Negotiation queue is unavailable.',
      status: workerStatus,
      required: true,
      action: 'Inspect the process-negotiations cron, LLM provider, and decision claim lease.',
    },
    {
      id: 'shopify-worker',
      label: 'Shopify catalog worker',
      detail: 'Product webhooks debounce into a recoverable, exact-shop sync queue.',
      evidence: sources.shopify
        ? `${metrics.shopifyInstalls} active installs; ${metrics.shopifyPending} queued; ${metrics.shopifyErrors} failed.`
        : 'Shopify queue is unavailable.',
      status: shopifyStatus,
      required: true,
      action: 'Inspect the Shopify catalog cron, app credentials, and the failed install row.',
    },
    {
      id: 'outbound-delivery',
      label: 'Seller webhook delivery',
      detail: 'Active seller endpoints should end on a successful delivery status.',
      evidence: sources.outboundWebhooks
        ? `${metrics.activeOutboundWebhooks} active endpoints; ${metrics.failedOutboundWebhooks} report a failed last delivery.`
        : 'Seller webhook state is unavailable.',
      status: !sources.outboundWebhooks
        ? 'unknown'
        : metrics.failedOutboundWebhooks > 0
          ? 'attention'
          : 'ready',
      required: false,
      action: 'Ask the seller to repair or disable endpoints that repeatedly reject signed deliveries.',
    },
    {
      id: 'protocol-sessions',
      label: 'Agent checkout sessions',
      detail: 'ACP and UCP session snapshots should complete or expire without remaining actionable.',
      evidence: sources.checkoutSessions
        ? `${metrics.expiredCheckoutSessions} expired sessions still remain in an actionable state.`
        : 'Agent checkout session state is unavailable.',
      status: !sources.checkoutSessions
        ? 'unknown'
        : metrics.expiredCheckoutSessions > 0
          ? 'attention'
          : 'ready',
      required: false,
      action: 'Expire or garbage-collect stale protocol sessions and inspect their originating agent requests.',
    },
    {
      id: 'support-pressure',
      label: 'Urgent support pressure',
      detail: 'Urgent unresolved tickets are launch signals even when the underlying service remains healthy.',
      evidence: sources.support
        ? `${metrics.urgentSupportTickets} urgent unresolved tickets.`
        : 'Support queue is unavailable.',
      status: !sources.support
        ? 'unknown'
        : metrics.urgentSupportTickets > 0
          ? 'attention'
          : 'ready',
      required: false,
      action: 'Triage urgent tickets before widening launch traffic.',
    },
  ]
}

export function buildMarketplaceCurationCheck(signal: MarketplaceCurationSignal): LaunchCheck {
  const target = 20
  const ready = signal.available
    && signal.summary.certified >= target
    && signal.summary.unreviewed === 0
  return {
    id: 'marketplace-curation',
    label: 'Marketplace launch supply',
    detail: 'Published listings need an explicit quality decision before marketplace traffic widens.',
    evidence: signal.available
      ? `${signal.summary.certified} certified, ${signal.summary.candidate} candidates, ${signal.summary.unreviewed} unreviewed, and ${signal.summary.excluded} excluded.`
      : 'The marketplace curation ledger is unavailable.',
    status: !signal.available ? 'unknown' : ready ? 'ready' : 'attention',
    required: false,
    action: `Certify at least ${target} launch listings and clear the unreviewed queue.`,
  }
}

export function buildCertificationChecks(
  metrics: LaunchMetrics,
  sources: LaunchSourceAvailability,
  configuration: LaunchCheck[],
): LaunchCheck[] {
  const configStatus = (id: string) => configuration.find((check) => check.id === id)?.status ?? 'unknown'
  const paymentEvidence = sources.orders && metrics.directOrders > 0
  const refundEvidence = sources.orders && sources.negotiations && (metrics.refundedOrders + metrics.refundedNegotiations > 0)
  const escrowEvidence = sources.negotiations && metrics.paymentBackedNegotiations > 0

  return [
    {
      id: 'cert-approval',
      label: 'Approval-token gauntlet',
      detail: 'Dry runs must issue payload-bound tokens, while tokenless live checkout and negotiation requests return 403.',
      evidence: configStatus('approval-safety') === 'ready'
        ? 'Mandatory payload-bound enforcement is active; the release record still includes the automated request gauntlet.'
        : 'Production enforcement is not ready.',
      status: configStatus('approval-safety') === 'ready' ? 'ready' : 'blocked',
      required: true,
      action: 'Run npm run certify:commerce and retain the passing output with the release record.',
    },
    {
      id: 'cert-connect',
      label: 'Seller payout readiness',
      detail: 'At least one certification seller must accept charges and payouts through its own Connect account.',
      evidence: sources.billing
        ? `${metrics.connectChargeReady} charge-ready and ${metrics.connectPayoutReady} payout-ready seller accounts.`
        : 'Billing state is unavailable.',
      status: !sources.billing
        ? 'unknown'
        : metrics.connectChargeReady > 0 && metrics.connectPayoutReady > 0
          ? 'ready'
          : 'blocked',
      required: true,
      action: 'Complete Stripe Connect onboarding on the certification seller and wait for account.updated.',
    },
    {
      id: 'cert-direct-checkout',
      label: 'Direct checkout lifecycle',
      detail: 'A real low-value order must settle through the seller account and persist in the durable order ledger.',
      evidence: sources.orders
        ? `${metrics.directOrders} direct order records are available; ${metrics.paidOrders} orders currently remain paid across all channels.`
        : 'Order evidence is unavailable.',
      status: !sources.orders ? 'unknown' : paymentEvidence ? 'ready' : 'attention',
      required: true,
      action: 'Complete one low-value live checkout and confirm the receipt, fee, order portal, and seller ledger.',
    },
    {
      id: 'cert-escrow',
      label: 'Negotiation and escrow lifecycle',
      detail: 'A proposal must reach agreement, fund on the seller account, and reconcile into a terminal state.',
      evidence: sources.negotiations
        ? `${metrics.paymentBackedNegotiations} payment-backed negotiations; ${metrics.heldNegotiations} currently held.`
        : 'Negotiation evidence is unavailable.',
      status: !sources.negotiations ? 'unknown' : escrowEvidence ? 'ready' : 'attention',
      required: true,
      action: 'Run one low-value proposal through agreement, funding, capture, webhook sync, and reconciliation.',
    },
    {
      id: 'cert-refund',
      label: 'Partial and full refund lifecycle',
      detail: 'Refund evidence must prove the refundable remainder, fee reversal, webhook reconciliation, and buyer notification.',
      evidence: sources.orders && sources.negotiations
        ? `${metrics.refundedOrders + metrics.refundedNegotiations} durable records contain refund evidence.`
        : 'Refund evidence is unavailable.',
      status: !sources.orders || !sources.negotiations ? 'unknown' : refundEvidence ? 'ready' : 'attention',
      required: true,
      action: 'Partially refund a captured certification order, verify the remainder, then finish the refund and confirm both ledgers.',
    },
    {
      id: 'cert-subscription',
      label: 'Subscription billing lifecycle',
      detail: 'A paid plan must subscribe, update through the webhook, open the billing portal, and cancel cleanly.',
      evidence: sources.billing
        ? `${metrics.subscriptionRecords} durable subscription records exist; ${metrics.activeSubscriptions} currently confer paid access.`
        : 'Subscription state is unavailable.',
      status: !sources.billing
        ? 'unknown'
        : configStatus('stripe-catalog') === 'blocked'
          ? 'blocked'
          : metrics.subscriptionRecords > 0
            ? 'ready'
            : 'attention',
      required: true,
      action: 'Use the authenticated certification account to subscribe, verify webhook sync, open the portal, and cancel.',
    },
    {
      id: 'cert-price-sync',
      label: 'Stripe price synchronization',
      detail: 'A Stripe default-price replacement should reach Nexez and leave both webhook and listing audit evidence.',
      evidence: sources.stripeWebhooks
        ? `${metrics.stripePriceWebhookEvents} Stripe catalog webhook events and ${metrics.stripePriceSyncEvents} linked-offer audit events are present.`
        : 'Stripe webhook evidence is unavailable.',
      status: !sources.stripeWebhooks
        ? 'unknown'
        : metrics.stripePriceWebhookEvents > 0 && metrics.stripePriceSyncEvents > 0
          ? 'ready'
          : 'attention',
      required: false,
      action: 'Replace a certification Product default Price and confirm the linked offer and checkout audit event change once.',
    },
    {
      id: 'cert-protocol',
      label: 'ACP and UCP checkout lifecycle',
      detail: 'Protocol-created sessions must preserve idempotency and settle into the same durable seller order ledger.',
      evidence: sources.orders
        ? `${metrics.acpProtocolOrders} ACP and ${metrics.ucpProtocolOrders} UCP orders are proven (${metrics.protocolOrders} live, ${metrics.sandboxProtocolOrders} sandbox).`
        : 'Protocol order evidence is unavailable.',
      status: !sources.orders
        ? 'unknown'
        : metrics.acpProtocolOrders > 0 && metrics.ucpProtocolOrders > 0
          ? 'ready'
          : 'attention',
      required: false,
      action: 'Run one sandbox ACP and one sandbox UCP create, update, and complete sequence with replayed idempotency keys.',
    },
  ]
}

export function summarizeLaunchChecks(checks: LaunchCheck[]): LaunchSummary {
  const counts: Record<LaunchStatus, number> = { ready: 0, attention: 0, blocked: 0, unknown: 0 }
  for (const check of checks) counts[check.status] += 1

  const required = checks.filter((check) => check.required)
  const weighted = required.reduce((sum, check) => sum + READY_WEIGHT[check.status], 0)
  const score = required.length ? Math.round((weighted / required.length) * 100) : 0
  const status: LaunchStatus = required.some((check) => check.status === 'blocked')
    ? 'blocked'
    : required.some((check) => check.status !== 'ready')
      ? 'attention'
      : 'ready'

  return { status, score, ...counts }
}

export function ageHours(value: string | null, nowIso: string): number | null {
  if (!value) return null
  const occurred = Date.parse(value)
  const now = Date.parse(nowIso)
  if (!Number.isFinite(occurred) || !Number.isFinite(now)) return null
  return Math.max(0, (now - occurred) / 3_600_000)
}

export function relativeAge(value: string, nowIso: string): string {
  const hours = ageHours(value, nowIso)
  if (hours == null) return 'at an unknown time'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}
