import { ArrowLeft, BadgeCheck, Bot, CheckCircle2 } from 'lucide-react'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string; offer?: string }>
}

export default async function CheckoutSuccessPage({ params, searchParams }: PageProps) {
  const [{ slug }, search] = await Promise.all([params, searchParams])

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <a href={`/${slug}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" />
          Back to agent page
        </a>

        <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.04] p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-400 text-zinc-950">
            <CheckCircle2 className="size-9" />
          </div>
          <p className="mt-6 text-sm font-medium text-cyan-200">Checkout handoff complete</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Payment session created</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            Nexez attached the selected offer and agent context to this checkout handoff. The seller can reconcile
            the session from Stripe metadata.
          </p>

          <div className="mt-7 grid gap-3 text-left text-sm md:grid-cols-2">
            <Detail label="Offer key" value={search.offer || 'Not provided'} />
            <Detail label="Stripe session" value={search.session_id || 'Pending provider callback'} />
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href={`/${slug}`} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-200">
              <Bot className="size-4" />
              Public Page
            </a>
            <a href={`/checkout/${slug}${search.offer ? `?offer=${search.offer}` : ''}`} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-3 text-sm text-zinc-200 hover:bg-white/10">
              <BadgeCheck className="size-4" />
              Checkout Context
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 break-all text-zinc-200">{value}</p>
    </div>
  )
}
