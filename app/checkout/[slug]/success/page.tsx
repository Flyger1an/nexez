import { ArrowLeft, BadgeCheck, Bot, CheckCircle2, LifeBuoy, Package } from 'lucide-react'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { loadOrderTokenBySession } from '../../../../lib/server/load-order'
import { loadServiceAgreementTokenBySession } from '../../../../lib/server/load-service-agreement'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string; offer?: string }>
}

export default async function CheckoutSuccessPage({ params, searchParams }: PageProps) {
  const [{ slug }, search] = await Promise.all([params, searchParams])

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

  // One-shot orders and recurring agreements use distinct bearer capabilities.
  // The Stripe session is the server-side handoff key; neither buyer token is
  // embedded into Stripe metadata or exposed until the provider redirects here.
  const [orderLookup, recurringLookup] = search.session_id
    ? await Promise.all([
        loadOrderTokenBySession(search.session_id),
        loadServiceAgreementTokenBySession(search.session_id),
      ])
    : [null, null]
  const portalUrl = recurringLookup
    ? `/service-agreements/${recurringLookup.token}`
    : orderLookup
      ? `/orders/${orderLookup.token}`
      : null
  const recurring = Boolean(recurringLookup)

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
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {recurring ? 'Recurring service started' : 'Payment session created'}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            {recurring
              ? 'Nexez bound the merchant terms, your selected cadence, and the fixed per-period amount into one recurring service agreement.'
              : 'Nexez attached the selected offer and agent context to this checkout handoff. The seller can reconcile the session from Stripe metadata.'}
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
              <Package className="size-4 text-[var(--signal)]" />
              {recurring ? 'Manage your recurring service' : 'Track & manage your order'}
            </p>
            {portalUrl ? (
              <>
                <p className="mt-1 text-zinc-400">
                  {recurring
                    ? 'View the approved cadence and service periods, cancel at the end of the current paid period, or reverse a pending cancellation.'
                    : 'View your order, track its status, request a refund, or report a problem any time.'}
                </p>
                <a href={portalUrl} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--signal)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90">
                  {recurring ? 'Manage recurring service' : 'Open your order'}
                </a>
              </>
            ) : (
              <p className="mt-1 text-zinc-400">
                We&rsquo;re finalizing your purchase. If this is a recurring service, the private management link appears once the agreement handoff is available.
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
