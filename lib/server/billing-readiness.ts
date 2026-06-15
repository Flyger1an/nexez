import 'server-only'

/**
 * Server-only Stripe billing readiness checks. These read presence of the secret
 * env vars (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY),
 * so they live behind `import 'server-only'` to keep them — and any future secret
 * reads — out of client bundles. The pure plan catalog (lib/billing.ts) stays
 * client-safe and reads only non-secret price IDs.
 */
import { billingPlans, getPlanPriceId } from '../billing'

export function getStripeBillingReadiness() {
  const selfServePaidPlans = billingPlans.filter((plan) => plan.envVar && plan.id !== 'enterprise')
  const configuredPlans = selfServePaidPlans.filter((plan) => Boolean(getPlanPriceId(plan)))
  const missingPlanEnvVars = selfServePaidPlans
    .filter((plan) => !getPlanPriceId(plan))
    .map((plan) => plan.envVar)
  const secretKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY)
  const webhookSecretConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  const serviceRoleConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

  return {
    secretKeyConfigured,
    webhookSecretConfigured,
    serviceRoleConfigured,
    configuredPlans,
    missingPlanEnvVars,
    subscriptionCheckoutReady: secretKeyConfigured && configuredPlans.length > 0,
    webhookSyncReady: webhookSecretConfigured && serviceRoleConfigured,
    productionReady: secretKeyConfigured && webhookSecretConfigured && serviceRoleConfigured && missingPlanEnvVars.length === 0,
  }
}

export function isStripeBillingConfigured() {
  return getStripeBillingReadiness().subscriptionCheckoutReady
}
