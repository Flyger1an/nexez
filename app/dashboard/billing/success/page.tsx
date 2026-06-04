import { CheckCircle2, CreditCard } from 'lucide-react'
import { getBillingPlan } from '../../../../lib/billing'

type SuccessProps = {
  searchParams: Promise<{ session_id?: string; plan?: string }>
}

export default async function BillingSuccessPage({ searchParams }: SuccessProps) {
  const { session_id: sessionId, plan: planId } = await searchParams
  const plan = getBillingPlan(planId)

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <section className="card !p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-400 text-zinc-950">
            <CheckCircle2 className="size-9" />
          </div>
          <p className="mt-6 text-sm font-medium text-cyan-200">Subscription checkout complete</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {plan ? `${plan.name} is active` : 'Plan activated'}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            Stripe created a subscription checkout session for this Nexez workspace.
          </p>

          <div className="mt-7 card !p-4 text-left text-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Stripe session</p>
            <p className="mt-2 break-all font-mono text-zinc-200">{sessionId || 'No session id provided'}</p>
          </div>

          <a href="/dashboard" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-200">
            <CreditCard className="size-4" />
            Dashboard
          </a>
        </section>
      </div>
    </main>
  )
}
