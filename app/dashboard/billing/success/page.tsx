import { CheckCircle2, CreditCard, ArrowRight } from 'lucide-react'
import { getBillingPlan } from '../../../../lib/billing'

type SuccessProps = {
  searchParams: Promise<{ 
    session_id?: string; 
    plan?: string; 
    embedded_success?: string; 
  }>
}

export default async function BillingSuccessPage({ searchParams }: SuccessProps) {
  const { session_id: sessionId, plan: planId, embedded_success } = await searchParams
  const plan = getBillingPlan(planId)
  const isEmbedded = !!embedded_success

  const heading = plan 
    ? `${plan.name} is active` 
    : 'Plan activated'

  const description = isEmbedded
    ? 'Your subscription was successfully created using Stripe\'s secure embedded checkout. The payment was confirmed in-page with the Payment Element.'
    : 'Stripe created a subscription checkout session for this Nexez workspace.'

  const sessionLabel = isEmbedded ? 'Confirmation' : 'Stripe session'
  const sessionValue = isEmbedded 
    ? 'Embedded flow (no hosted session ID)' 
    : (sessionId || 'No session id provided')

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <section className="card !p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-400 text-zinc-950">
            <CheckCircle2 className="size-9" />
          </div>

          <p className="mt-6 text-sm font-medium text-cyan-200">
            {isEmbedded ? 'Embedded subscription confirmed' : 'Subscription checkout complete'}
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {heading}
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            {description}
          </p>

          <div className="mt-7 card !p-4 text-left text-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{sessionLabel}</p>
            <p className="mt-2 break-all font-mono text-zinc-200">{sessionValue}</p>
            {plan && (
              <p className="mt-2 text-xs text-[#9CA3AF]">
                Plan: {plan.name} ({plan.price}/{plan.cadence}) • Platform commission: {plan.commissionPercent}%
              </p>
            )}
          </div>

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <a 
              href="/dashboard/billing" 
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7C3AED] px-5 py-3 text-sm font-semibold text-white hover:bg-[#6D28D9]"
            >
              <CreditCard className="size-4" />
              View Billing &amp; Plan
            </a>

            <a 
              href="/dashboard" 
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              Go to Dashboard
              <ArrowRight className="size-4" />
            </a>
          </div>

          <p className="mt-6 text-xs text-zinc-500 max-w-md mx-auto">
            {isEmbedded 
              ? 'Your billing status will update shortly once the webhook syncs the subscription details. You can manage everything (cancel, update payment method) via the Stripe portal from the Billing page.'
              : 'Your subscription is now active. Manage billing, update payment methods, or cancel via the Stripe portal linked from your Billing dashboard.'}
          </p>
        </section>
      </div>
    </main>
  )
}
