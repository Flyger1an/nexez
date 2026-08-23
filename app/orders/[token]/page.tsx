import { ArrowLeft, CheckCircle2, Circle, Package, ShieldQuestion } from 'lucide-react'
import type { Metadata } from 'next'
import { loadOrderByToken } from '../../../lib/server/load-order'
import {
  REQUEST_KIND_LABEL,
  REQUEST_STATUS_LABEL,
  buildOrderTimeline,
  canRequestRefund,
  describeOrderStatus,
  hasOpenRequest,
  type StatusTone,
} from '../../../lib/buyer-portal'
import { formatCurrencyAmount } from '../../../lib/currency'
import { BuyerOrderActions } from './BuyerOrderActions'
import { BuyerReviewCard } from './BuyerReviewCard'

// Private, per-buyer page keyed by an unguessable token - never index, never cache.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Your order', // root template appends ' · Nexez'
  robots: { index: false, follow: false },
}

const TONE_BADGE: Record<StatusTone, string> = {
  positive: 'text-[var(--ready)] border-[var(--ready)]/30 bg-[var(--ready)]/10',
  pending: 'text-[var(--signal)] border-[var(--signal)]/30 bg-[var(--signal)]/10',
  warning: 'text-[var(--amber)] border-[var(--amber)]/30 bg-[var(--amber)]/10',
  neutral: 'text-zinc-300 border-white/15 bg-white/5',
}

type PageProps = { params: Promise<{ token: string }> }

export default async function OrderPortalPage({ params }: PageProps) {
  const { token } = await params
  const order = await loadOrderByToken(token)

  if (!order) {
    return (
      <main className="min-h-screen bg-[#090b10] text-white">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <ShieldQuestion className="size-7 text-zinc-400" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold">Order not found</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">
            This order link is invalid or has expired. Check the link in your receipt email, or contact the seller you
            purchased from.
          </p>
        </div>
      </main>
    )
  }

  const status = describeOrderStatus(order.kind, order.status)
  const timeline = buildOrderTimeline(order)
  const amount = order.amountCents != null ? formatCurrencyAmount(order.amountCents, order.currency) : '-'
  const placed = new Date(order.createdAt).toLocaleString()

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {order.slug ? (
          <a href={`/${order.slug}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" /> {order.sellerName || 'Back to seller listing'}
          </a>
        ) : null}

        <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
              <Package className="size-4" /> Your order
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{order.offerName || 'Your purchase'}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {order.sellerName ? `From ${order.sellerName}` : 'Nexez order'} · {placed}
            </p>
          </div>
          <span className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${TONE_BADGE[status.tone]}`}>
            {status.label}
          </span>
        </header>

        <section className="mt-6 card !p-6">
          <p className="text-sm leading-6 text-zinc-300">{status.description}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail label="Amount" value={amount} />
            <Detail label="Status" value={status.label} />
            {order.kind === 'checkout' ? <Detail label="Fulfillment" value={buyerFulfillmentLabel(order.fulfillment?.status)} /> : null}
            <Detail label="Reference" value={order.reference} mono />
            <Detail label="Placed" value={placed} />
          </div>

          {/* Timeline */}
          <div className="mt-7">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Progress</p>
            <ol className="mt-3 space-y-3">
              {timeline.map((step) => (
                <li key={step.key} className="flex items-center gap-3 text-sm">
                  {step.done ? (
                    <CheckCircle2 className={`size-4 ${step.current ? 'text-[var(--signal)]' : 'text-[var(--ready)]'}`} />
                  ) : (
                    <Circle className={`size-4 ${step.current ? 'text-[var(--signal)]' : 'text-zinc-600'}`} />
                  )}
                  <span className={step.done || step.current ? 'text-zinc-200' : 'text-zinc-500'}>{step.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Existing requests */}
        {order.requests.length ? (
          <section className="mt-6 card !p-6">
            <h2 className="text-sm font-semibold text-white">Your requests</h2>
            <ul className="mt-3 space-y-2">
              {order.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                  <span className="text-zinc-200">{REQUEST_KIND_LABEL[r.kind] || r.kind}</span>
                  <span className="text-xs text-zinc-400">{REQUEST_STATUS_LABEL[r.status] || r.status}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <BuyerReviewCard
          token={order.token}
          canReview={order.canReview}
          review={order.review}
          sellerName={order.sellerName}
        />

        {/* Recourse */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Need help with this order?</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Requests go straight to the seller - they handle the refund or response. Nexez never charges you to ask.
          </p>
          <BuyerOrderActions
            token={order.token}
            offerName={order.offerName}
            sellerEmail={order.sellerEmail}
            sellerName={order.sellerName}
            reference={order.reference}
            canRefund={canRequestRefund(order)}
            hasOpenRefund={hasOpenRequest(order, 'refund_request')}
            hasOpenProblem={hasOpenRequest(order, 'problem_report')}
          />
        </section>
      </div>
    </main>
  )
}

function buyerFulfillmentLabel(status: 'not_started' | 'in_progress' | 'fulfilled' | undefined) {
  if (status === 'not_started') return 'Preparing'
  if (status === 'in_progress') return 'In progress'
  if (status === 'fulfilled') return 'Fulfilled'
  return 'Seller update pending'
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 break-all text-zinc-200 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</p>
    </div>
  )
}
