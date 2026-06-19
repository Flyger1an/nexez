import 'server-only'

/**
 * Server-only Stripe billing readiness checks. These read presence of the secret
 * env vars (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY),
 * so they live behind `import 'server-only'` to keep them — and any future secret
 * reads — out of client bundles. The pure plan catalog (lib/billing.ts) stays
 * client-safe and reads only non-secret price IDs.
 */
import { billingPlans, getPlanPriceId, isStripePriceId } from '../billing'

export function getStripeBillingReadiness() {
  const selfServePaidPlans = billingPlans.filter((plan) => plan.envVar && plan.id !== 'enterprise')
  const planPriceEntries = selfServePaidPlans.map((plan) => ({ plan, priceId: getPlanPriceId(plan) }))
  const configuredPlans = planPriceEntries.filter((entry) => isStripePriceId(entry.priceId)).map((entry) => entry.plan)
  const missingPlanEnvVars = selfServePaidPlans
    .filter((plan) => !getPlanPriceId(plan))
    .map((plan) => plan.envVar)
  const invalidPlanEnvVars = planPriceEntries
    .filter((entry) => entry.priceId && !isStripePriceId(entry.priceId))
    .map((entry) => entry.plan.envVar)
  const secretKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY)
  const webhookSecretConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  const serviceRoleConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

  return {
    secretKeyConfigured,
    webhookSecretConfigured,
    serviceRoleConfigured,
    configuredPlans,
    missingPlanEnvVars,
    invalidPlanEnvVars,
    subscriptionCheckoutReady: secretKeyConfigured && configuredPlans.length > 0,
    webhookSyncReady: webhookSecretConfigured && serviceRoleConfigured,
    productionReady: secretKeyConfigured && webhookSecretConfigured && serviceRoleConfigured && missingPlanEnvVars.length === 0 && invalidPlanEnvVars.length === 0,
  }
}

export function isStripeBillingConfigured() {
  return getStripeBillingReadiness().subscriptionCheckoutReady
}
