import { ArrowLeft, BadgeCheck, Bot, CheckCircle2, LifeBuoy, Package } from 'lucide-react'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { loadOrderTokenBySession } from '../../../../lib/server/load-order'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string; offer?: string }>
}

export default async function CheckoutSuccessPage({ params, searchParams }: PageProps) {
  const [{ slug }, search] = await Promise.all([params, searchParams])

  // Buyer recourse: surface the seller's contact (from the redacted public view) so a
  // buyer with a question/issue has a path - the seller can then refund from Finance.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: page } = await supabase
    .from('pages_public')
    .select('name, contact_email')
    .eq('slug', slug)
    .maybeSingle<{ name: string | null; contact_email: string | null }>()
  const sellerEmail = page?.contact_email || null
  const mailto = sellerEmail
    ? `mailto:${sellerEmail}?subject=${encodeURIComponent(`Order question - ${slug}`)}&body=${encodeURIComponent(`Hi, I have a question about my recent order${search.session_id ? ` (Stripe session ${search.session_id})` : ''}.`)}`
    : null

  // Map the Stripe session → the order's portal token so we can link the buyer
  // straight into their order portal. The order is captured by the webhook async,
  // so the token may not exist yet on the immediate redirect - in that case the
  // receipt email (which carries the same link) is the reliable delivery channel.
  const portalLookup = search.session_id ? await loadOrderTokenBySession(search.session_id) : null
  const portalUrl = portalLookup ? `/orders/${portalLookup.token}` : null

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

          <div className="mx-auto mt-8 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm">
            <p className="flex items-center gap-2 font-medium text-white">
              <Package className="size-4 text-[var(--signal)]" /> Track &amp; manage your order
            </p>
            {portalUrl ? (
              <>
                <p className="mt-1 text-zinc-400">
                  View your order, track its status, request a refund, or report a problem any time.
                </p>
                <a href={portalUrl} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--signal)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90">
                  Open your order
                </a>
              </>
            ) : (
              <p className="mt-1 text-zinc-400">
                We&rsquo;re finalizing your order - a receipt with a link to view, track, or get help with it is on its way
                to your email.
              </p>
            )}
            {mailto ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <LifeBuoy className="size-3.5" />
                Prefer email?{' '}
                <a href={mailto} className="text-[var(--signal)] hover:underline">
                  Contact {page?.name || 'the seller'}
                </a>
              </p>
            ) : null}
          </div>
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
