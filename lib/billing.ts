export type BillingPlan = {
  id: 'launch' | 'pro' | 'scale'
  name: string
  price: string
  cadence: string
  envVar: string
  blurb: string
  features: string[]
}

export const billingPlans: BillingPlan[] = [
  {
    id: 'launch',
    name: 'Launch',
    price: '$19',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_LAUNCH',
    blurb: 'For a solo services pro validating agent traffic.',
    features: ['3 published pages', 'Agent JSON + llms.txt', 'Directory listing', 'Basic analytics'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_PRO',
    blurb: 'For teams running services, bookings, and paid offers.',
    features: ['25 published pages', 'Checkout event tracking', 'Agent simulator', 'Integrations workspace'],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '$149',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_SCALE',
    blurb: 'For agencies and operators managing many agent pages.',
    features: ['Unlimited pages', 'Custom domain readiness', 'Advanced analytics', 'Priority setup'],
  },
]

export function getBillingPlan(id: string | null | undefined) {
  return billingPlans.find((plan) => plan.id === id)
}

export function getPlanPriceId(plan: BillingPlan) {
  return process.env[plan.envVar] || ''
}

export function isStripeBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && billingPlans.some((plan) => getPlanPriceId(plan)))
}
