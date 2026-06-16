import { ArrowRight, Package, ShieldQuestion } from 'lucide-react'
import type { Metadata } from 'next'
import { verifyLookupToken } from '../../../../lib/server/order-lookup-token'
import { findOrdersByEmail } from '../../../../lib/server/load-order'
import { describeOrderStatus, type StatusTone } from '../../../../lib/buyer-portal'
import { formatCurrencyAmount } from '../../../../lib/currency'
import { LocalDate } from './LocalDate'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Your orders · Nexez',
  robots: { index: false, follow: false },
}

const TONE_BADGE: Record<StatusTone, string> = {
  positive: 'text-[var(--ready)] border-[var(--ready)]/30 bg-[var(--ready)]/10',
  pending: 'text-[var(--signal)] border-[var(--signal)]/30 bg-[var(--signal)]/10',
  warning: 'text-[var(--amber)] border-[var(--amber)]/30 bg-[var(--amber)]/10',
  neutral: 'text-zinc-300 border-white/15 bg-white/5',
}

type PageProps = { params: Promise<{ token: string }> }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">{children}</div>
    </main>
  )
}

export default async function OrdersFindPage({ params }: PageProps) {
  const { token } = await params
  const email = verifyLookupToken(token)

  if (!email) {
    return (
      <Shell>
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <ShieldQuestion className="size-7 text-zinc-400" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold">This link is no longer valid</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">
            Order links expire after 24 hours for your security. Request a fresh one and we&rsquo;ll email it to you.
          </p>
          <a href="/orders" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--signal)] px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:opacity-90">
            Find my orders
          </a>
        </div>
      </Shell>
    )
  }

  const orders = await findOrdersByEmail(email)

  return (
    <Shell>
      <header>
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
          <Package className="size-4" /> Your orders
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Orders for {email}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {orders.length ? `${orders.length} order${orders.length === 1 ? '' : 's'}.` : 'No orders found for this email.'} Open
          one to view details, track status, request a refund, or report a problem.
        </p>
      </header>

      {orders.length ? (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => {
            const status = describeOrderStatus(o.kind, o.status)
            return (
              <li key={o.token}>
                <a
                  href={`/orders/${o.token}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.05]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{o.offerName || 'Your purchase'}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {o.sellerName ? `${o.sellerName} · ` : ''}
                      <LocalDate iso={o.createdAt} />
                      {o.amountCents != null ? ` · ${formatCurrencyAmount(o.amountCents, o.currency)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`hidden rounded-full border px-2.5 py-0.5 text-xs font-medium sm:inline-flex ${TONE_BADGE[status.tone]}`}>
                      {status.label}
                    </span>
                    <ArrowRight className="size-4 text-zinc-500" />
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          We couldn&rsquo;t find any orders for this email. If you used a different email at checkout, search again with that one.
        </p>
      )}
    </Shell>
  )
}
