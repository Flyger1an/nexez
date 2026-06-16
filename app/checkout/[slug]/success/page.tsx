import { ArrowLeft, BadgeCheck, Bot, CheckCircle2, LifeBuoy } from 'lucide-react'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string; offer?: string }>
}

export default async function CheckoutSuccessPage({ params, searchParams }: PageProps) {
  const [{ slug }, search] = await Promise.all([params, searchParams])

  // Buyer recourse: surface the seller's contact (from the redacted public view) so a
  // buyer with a question/issue has a path — the seller can then refund from Finance.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: page } = await supabase
    .from('pages_public')
    .select('name, contact_email')
    .eq('slug', slug)
    .maybeSingle<{ name: string | null; contact_email: string | null }>()
  const sellerEmail = page?.contact_email || null
  const mailto = sellerEmail
    ? `mailto:${sellerEmail}?subject=${encodeURIComponent(`Order question — ${slug}`)}&body=${encodeURIComponent(`Hi, I have a question about my recent order${search.session_id ? ` (Stripe session ${search.session_id})` : ''}.`)}`
    : null

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <a href={`/${slug}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" />
          Back to agent page
        </a>

        <section className="mt-8 card !p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--ready)] text-zinc-950">
            <CheckCircle2 className="size-9" />
          </div>
          <p className="mt-6 text-sm font-medium text-[var(--signal)]">Checkout handoff complete</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Payment session created</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            Nexez attached the selected offer and agent context to this checkout handoff. The seller can reconcile
            the session from Stripe metadata.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-3 text-left text-sm md:grid-cols-2">
            <Detail label="Offer key" value={search.offer || 'Not provided'} />
            <Detail label="Stripe session" value={search.session_id || 'Pending provider callback'} />
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href={`/${slug}`} className="inline-flex items-center gap-2 rounded-lg bg-[var(--signal)] px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-[var(--signal)]">
              <Bot className="size-4" />
              Public Page
            </a>
            <a href={`/checkout/${slug}${search.offer ? `?offer=${search.offer}` : ''}`} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-3 text-sm text-zinc-200 hover:bg-white/10">
              <BadgeCheck className="size-4" />
              Checkout Context
            </a>
          </div>

          {mailto ? (
            <div className="mx-auto mt-8 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm">
              <p className="flex items-center gap-2 font-medium text-white">
                <LifeBuoy className="size-4 text-[var(--signal)]" /> Questions or an issue with this order?
              </p>
              <p className="mt-1 text-zinc-400">
                Contact {page?.name || 'the seller'} directly — they can look it up by the Stripe session above and refund
                if needed.
              </p>
              <a href={mailto} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-4 py-2 text-sm font-semibold text-[var(--signal)] hover:bg-[var(--signal)]/20">
                Contact the seller
              </a>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 break-all text-zinc-200">{value}</p>
    </div>
  )
}
