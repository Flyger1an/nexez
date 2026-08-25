import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileCheck2,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react'
import { createClient } from '../../../../utils/supabase/server'
import { DataLoadNotice } from '../../../../components/dashboard/DataLoadNotice'
import { OrderOperationsPanel } from '../../../../components/dashboard/OrderOperationsPanel'
import { SurfaceHeader } from '../../../../components/dashboard/SurfacePrimitives'
import { formatCurrencyAmount } from '../../../../lib/currency'
import { formatDisplayDate, formatDisplayDateTime, resolveDisplayLocale } from '../../../../lib/international-operations'
import { describeOrderActivity } from '../../../../lib/order-operations'
import {
  getOrderChannelLabel,
  getOrderDisplayStatus,
  getOrderEconomics,
  orderStatusTone,
  shortOrderReference,
} from '../../../../lib/order-dashboard'
import {
  loadDashboardOrderDetail,
  type DashboardOrder,
  type StagedSettlementObligation,
} from '../../../../lib/server/dashboard-orders'

type OrderDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const [{ id }, cookieStore, headerStore] = await Promise.all([params, cookies(), headers()])
  const locale = resolveDisplayLocale(headerStore.get('accept-language'))
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-[var(--fg)]">
        <Link href={`/login?next=/dashboard/orders/${encodeURIComponent(id)}`} className="btn-primary min-h-11 px-5 py-3">
          Sign in to view this order
        </Link>
      </main>
    )
  }

  const detail = await loadDashboardOrderDetail(supabase, user.id, id)
  if (!detail) notFound()
  const { order } = detail
  const economics = getOrderEconomics(order)
  const currentStagedObligation = detail.stagedObligations.find((obligation) => obligation.id === order.staged_settlement_obligation_id)

  return (
    <main data-testid="order-detail" className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Link href="/dashboard/orders" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] px-2 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to orders
        </Link>

        <SurfaceHeader
          eyebrow={`Order #${shortOrderReference(order.id)}`}
          icon={PackageCheck}
          title={order.offer_name || 'Order details'}
          description={`Placed ${formatDisplayDateTime(order.created_at, locale)} through ${getOrderChannelLabel(order.channel)}. Review the payment, customer, and fulfillment details below.`}
          actions={(
            <>
              {order.slug ? (
                <Link href={`/${order.slug}`} target="_blank" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--fill-1)]">
                  Public listing <ExternalLink className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
              <Link href="/dashboard/finance" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--fill-1)]">
                <CircleDollarSign className="size-4" aria-hidden="true" /> Finance
              </Link>
            </>
          )}
          footer={(
            <>
              <OrderStatus order={order} />
              <MetaPill label="Order source" value={getOrderChannelLabel(order.channel)} />
              <MetaPill label="Currency" value={order.currency.toUpperCase()} />
              <MetaPill label="Mode" value={order.stripe_livemode === true ? 'Live' : order.stripe_livemode === false ? 'Test' : 'Unverified'} />
            </>
          )}
        />

        <DataLoadNotice issues={detail.issues} />

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Order totals">
          <MoneyCard label="Gross sales" value={formatCurrencyAmount(economics.grossCents, order.currency, locale)} detail="Customer payment" icon={ReceiptText} />
          <MoneyCard label="Refunded" value={formatCurrencyAmount(economics.refundedCents, order.currency, locale)} detail={economics.refundedCents ? 'Refunded or disputed' : 'No refunds or disputes'} icon={RefreshCcw} tone={economics.refundedCents ? 'attention' : undefined} />
          <MoneyCard label="Nexez fee" value={formatCurrencyAmount(economics.retainedFeeCents, order.currency, locale)} detail={feeDetail(order)} icon={BadgeDollarSign} />
          <MoneyCard label="Net to you" value={formatCurrencyAmount(economics.netCents, order.currency, locale)} detail="After recorded refunds and fees" icon={CircleDollarSign} tone="ready" />
        </section>

        <div className="mt-6">
          <OrderOperationsPanel
            order={{
              id: order.id,
              status: order.status,
              amountCents: order.amount_cents,
              currency: order.currency,
              refundedCents: order.refunded_cents,
              paymentIntentId: order.stripe_payment_intent_id,
              channel: order.channel,
            }}
            fulfillment={detail.fulfillment ? {
              status: detail.fulfillment.status,
              version: detail.fulfillment.version,
              updatedAt: detail.fulfillment.updated_at,
            } : null}
            requests={detail.requests.map((request) => ({
              id: request.id,
              kind: request.kind,
              status: request.status,
              message: request.message,
              buyerEmail: request.buyer_email,
              createdAt: request.created_at,
            }))}
            stagedObligationKind={currentStagedObligation?.kind}
            locale={locale}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-6">
            {detail.stagedAgreement ? (
              <StagedAgreementCard
                order={order}
                agreement={detail.stagedAgreement}
                obligations={detail.stagedObligations}
                locale={locale}
              />
            ) : null}

            {detail.serviceAgreement ? (
              <SectionCard icon={CalendarClock} title="Recurring agreement" eyebrow="Subscription details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Agreement state" value={humanize(detail.serviceAgreement.status)} />
                  <Detail label="Per period" value={formatCurrencyAmount(detail.serviceAgreement.amount_per_period_cents, detail.serviceAgreement.currency, locale)} />
                  <Detail label="Current period" value={dateRange(detail.serviceAgreement.current_period_start, detail.serviceAgreement.current_period_end, locale)} />
                  <Detail label="Renewal" value={detail.serviceAgreement.cancel_at_period_end ? 'Cancels after this period' : 'Active renewal'} />
                </div>
              </SectionCard>
            ) : null}

            {detail.resourceReservation ? (
              <SectionCard icon={FileCheck2} title="Reserved resource" eyebrow="Reservation details">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Detail label="Reservation state" value={humanize(detail.resourceReservation.status)} />
                  <Detail label="Committed" value={formatDisplayDateTime(detail.resourceReservation.committed_at, locale)} />
                  <Detail label="Allocation records" value={Array.isArray(detail.resourceReservation.allocation_snapshot) ? String(detail.resourceReservation.allocation_snapshot.length) : 'Recorded'} />
                </div>
              </SectionCard>
            ) : null}

            <SectionCard icon={Clock3} title="Activity" eyebrow="Order history">
              {detail.events.length ? (
                <ol className="space-y-0">
                  {detail.events.map((event, index) => {
                    const activity = describeOrderActivity(event, order.currency)
                    return (
                      <TimelineItem
                        key={event.id}
                        title={activity.title}
                        detail={`${activity.detail} ${formatDisplayDateTime(event.created_at, locale)} · ${humanize(event.source)}`}
                        complete={activity.tone === 'ready'}
                        attention={activity.tone === 'attention'}
                        last={index === detail.events.length - 1}
                      />
                    )
                  })}
                </ol>
              ) : <p className="text-sm leading-6 text-[var(--fg-muted)]">No activity has been recorded for this order yet.</p>}
            </SectionCard>

            {detail.reviews.length ? (
              <SectionCard icon={Star} title="Verified review" eyebrow="Customer feedback">
                {detail.reviews.map((review) => (
                  <article key={review.id}>
                    <div className="flex items-center gap-2 text-[var(--settings-emphasis)]" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, index) => <Star key={index} className={`size-4 ${index < review.rating ? 'fill-current' : 'opacity-25'}`} aria-hidden="true" />)}
                    </div>
                    {review.title ? <h3 className="mt-3 font-medium text-[var(--fg)]">{review.title}</h3> : null}
                    {review.body ? <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{review.body}</p> : null}
                    <p className="mt-3 text-xs text-[var(--fg-muted-2)]">{humanize(review.status)} · {formatDisplayDateTime(review.created_at, locale)}</p>
                  </article>
                ))}
              </SectionCard>
            ) : null}
          </div>

          <aside className="space-y-6">
            <SectionCard icon={UserRound} title="Customer" eyebrow="Contact details">
              <dl className="space-y-4">
                <Detail label="Name" value={order.buyer_name || 'Not provided'} />
                <Detail label="Email" value={order.buyer_email || 'Not provided'} />
                <Detail label="Customer reference" value={order.buyer_reference || 'Not provided'} mono={Boolean(order.buyer_reference)} />
                <Detail label="Customer agent" value={order.buyer_agent || 'Not recorded'} />
              </dl>
            </SectionCard>

            <SectionCard icon={PackageCheck} title="Order context" eyebrow="What was purchased">
              <dl className="space-y-4">
                <Detail label="Offer" value={order.offer_name || 'Offer name unavailable'} />
                <Detail label="Offer key" value={order.offer_key || 'Not recorded'} mono />
                <Detail label="Listing" value={order.slug ? `/${order.slug}` : 'Listing unavailable'} mono={Boolean(order.slug)} />
                <Detail label="Order source" value={getOrderChannelLabel(order.channel)} />
                {order.service_period_start || order.service_period_end ? <Detail label="Service period" value={dateRange(order.service_period_start, order.service_period_end, locale)} /> : null}
              </dl>
            </SectionCard>

            <SectionCard icon={ShieldCheck} title="Payment details" eyebrow="References">
              <dl className="space-y-4">
                <Detail label="Order ID" value={order.id} mono />
                <Detail label="Payment intent" value={safeReference(order.stripe_payment_intent_id)} mono />
                <Detail label="Checkout session" value={safeReference(order.stripe_session_id)} mono />
                {order.stripe_invoice_id ? <Detail label="Invoice" value={safeReference(order.stripe_invoice_id)} mono /> : null}
                <Detail label="Mode" value={order.stripe_livemode === true ? 'Live' : order.stripe_livemode === false ? 'Test' : 'Unverified'} />
                <Detail label="Plan at purchase" value={order.plan_id_at_purchase ? humanize(order.plan_id_at_purchase) : 'Older order or unavailable'} />
                <Detail label="Fee calculation" value={order.commission_source ? humanize(order.commission_source) : 'Older order or unavailable'} />
              </dl>
            </SectionCard>
          </aside>
        </div>
      </div>
    </main>
  )
}

function StagedAgreementCard({
  order,
  agreement,
  obligations,
  locale,
}: {
  order: DashboardOrder
  agreement: NonNullable<Awaited<ReturnType<typeof loadDashboardOrderDetail>>>['stagedAgreement']
  obligations: StagedSettlementObligation[]
  locale: string
}) {
  if (!agreement) return null
  return (
    <SectionCard icon={FileCheck2} title="Staged agreement" eyebrow="Payment schedule">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--fg-muted)]">Agreement total</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fg)]">{formatCurrencyAmount(agreement.total_amount_cents, agreement.currency, locale)}</p>
        </div>
        <span className="rounded-full border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 py-1.5 text-xs font-medium text-[var(--fg-muted)]">{humanize(agreement.status)}</span>
      </div>
      <ol className="mt-5 grid gap-3 lg:grid-cols-2">
        {obligations.map((obligation) => {
          const current = obligation.id === order.staged_settlement_obligation_id
          return (
            <li key={obligation.id} className={`rounded-[var(--radius)] border p-4 ${current ? 'border-[var(--settings-focus)] bg-[var(--settings-emphasis-soft)]' : 'border-[var(--line-soft)] bg-[var(--fill-1)]'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--fg-muted-2)]">Stage {obligation.stage_order} · {humanize(obligation.kind)}</p>
                  <p className="mt-2 font-medium text-[var(--fg)]">{obligation.label}</p>
                </div>
                {current ? <span className="rounded-full bg-[var(--settings-emphasis-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--settings-emphasis)]">This payment</span> : null}
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="text-sm text-[var(--fg-muted)]">{humanize(obligation.status)}</span>
                <span className="font-medium text-[var(--fg)]">{formatCurrencyAmount(obligation.amount_cents, agreement.currency, locale)}</span>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-xs leading-5 text-[var(--fg-muted-2)]">Each paid stage creates its own order. The full agreement keeps the customer-approved payment schedule together.</p>
    </SectionCard>
  )
}

function SectionCard({ icon: Icon, title, eyebrow, children }: { icon: typeof PackageCheck; title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-5 sm:p-6">
      <div className="flex items-center gap-3 border-b border-[var(--line-soft)] pb-4">
        <span className="flex size-10 items-center justify-center rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--settings-emphasis)]">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--fg-muted-2)]">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--fg)]">{title}</h2>
        </div>
      </div>
      <div className="pt-5">{children}</div>
    </section>
  )
}

function MoneyCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof PackageCheck; tone?: 'ready' | 'attention' }) {
  const toneClass = tone === 'ready' ? 'text-[var(--ready)]' : tone === 'attention' ? 'text-[var(--amber)]' : 'text-[var(--fg)]'
  return (
    <article className="rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--fg-muted-2)]">{label}</p>
        <Icon className="size-4 text-[var(--settings-emphasis)]" aria-hidden="true" />
      </div>
      <p className={`mt-3 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{detail}</p>
    </article>
  )
}

function TimelineItem({ title, detail, complete, attention, last }: { title: string; detail: string; complete?: boolean; attention?: boolean; last?: boolean }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <span className={`mt-0.5 flex size-5 items-center justify-center rounded-full border ${attention ? 'border-[var(--amber)] bg-[var(--amber)]/10 text-[var(--amber)]' : complete ? 'border-[var(--ready)] bg-[var(--ready)]/10 text-[var(--ready)]' : 'border-[var(--line-soft)] text-[var(--fg-muted-2)]'}`}>
          {complete ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : attention ? <Clock3 className="size-3" aria-hidden="true" /> : null}
        </span>
        {!last ? <span className="min-h-8 w-px flex-1 bg-[var(--line-soft)]" /> : null}
      </div>
      <div className={last ? '' : 'pb-5'}>
        <p className="text-sm font-medium text-[var(--fg)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{detail}</p>
      </div>
    </li>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-[var(--fg)] ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return <span className="rounded-full border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">{label}: <strong className="font-medium text-[var(--fg)]">{value}</strong></span>
}

function OrderStatus({ order }: { order: DashboardOrder }) {
  const tone = orderStatusTone(order)
  const classes = tone === 'danger'
    ? 'border-red-400/30 bg-red-400/10 text-red-300'
    : tone === 'attention'
      ? 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'
      : tone === 'ready'
        ? 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]'
        : 'border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--fg-muted)]'
  return <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium ${classes}`}>{getOrderDisplayStatus(order)}</span>
}

function feeDetail(order: DashboardOrder) {
  if (order.commission_bps != null) return `${(order.commission_bps / 100).toFixed(2).replace(/\.00$/, '')}% at purchase`
  if (order.commission_percent != null) return `${order.commission_percent}% at purchase`
  return 'Legacy rate unavailable'
}

function safeReference(value: string | null) {
  if (!value) return 'Not recorded'
  return value.length <= 20 ? value : `${value.slice(0, 8)}…${value.slice(-10)}`
}

function dateRange(start: string | null, end: string | null, locale: string) {
  if (!start && !end) return 'Not recorded'
  const format = (value: string) => formatDisplayDate(value, locale)
  if (!start) return `Ends ${format(end!)}`
  if (!end) return `Starts ${format(start)}`
  return `${format(start)} to ${format(end)}`
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())
}
