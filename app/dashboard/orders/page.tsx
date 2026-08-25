import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  Filter,
  PackageCheck,
  Search,
} from 'lucide-react'
import { createClient } from '../../../utils/supabase/server'
import { SurfaceHeader } from '../../../components/dashboard/SurfacePrimitives'
import { DataLoadNotice } from '../../../components/dashboard/DataLoadNotice'
import { EmptyState } from '../../../components/EmptyState'
import { formatCurrencyAmount } from '../../../lib/currency'
import { formatDisplayDate, resolveDisplayLocale } from '../../../lib/international-operations'
import {
  getOrderChannelLabel,
  getOrderDisplayStatus,
  getOrderEconomics,
  orderStatusTone,
  shortOrderReference,
} from '../../../lib/order-dashboard'
import {
  loadDashboardOrders,
  type DashboardOrder,
  type DashboardOrderFilters,
} from '../../../lib/server/dashboard-orders'

const STATUS_OPTIONS = [
  ['paid', 'Paid'],
  ['partial_refund', 'Partial refund'],
  ['refunded', 'Refunded'],
  ['disputed', 'Disputed'],
  ['dispute_won', 'Dispute won'],
] as const

const CHANNEL_OPTIONS = [
  ['agent_checkout', 'Agent checkout'],
  ['acp', 'Agent checkout'],
  ['ucp', 'Agent checkout'],
  ['nexie', 'Nexie'],
  ['recurring_service', 'Recurring service'],
  ['staged_settlement', 'Staged payments'],
  ['reservable_resource', 'Reservation'],
] as const

type OrdersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const [cookieStore, headerStore, rawFilters] = await Promise.all([cookies(), headers(), searchParams])
  const locale = resolveDisplayLocale(headerStore.get('accept-language'))
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-[var(--fg)]">
        <Link href="/login?next=/dashboard/orders" className="btn-primary min-h-11 px-5 py-3">
          Sign in to manage orders
        </Link>
      </main>
    )
  }

  const result = await loadDashboardOrders(supabase, user.id, rawFilters)
  if (result.total > 0 && result.filters.page > result.pages) {
    redirect(ordersHref(result.filters, result.pages))
  }
  const hasFilters = Boolean(result.filters.q || result.filters.status || result.filters.channel || result.filters.currency)

  return (
    <main data-testid="orders-dashboard" className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <SurfaceHeader
          eyebrow="Order management"
          icon={PackageCheck}
          title="Orders"
          description="Track payments, customers, and fulfillment for every order. Visit Finance for sales totals and payouts."
          actions={(
            <Link href="/dashboard/finance" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--fill-1)]">
              <CircleDollarSign className="size-4" aria-hidden="true" /> View finance
            </Link>
          )}
          footer={(
            <>
              <Metric label="Matching orders" value={String(result.total)} />
              <Metric label="Page" value={`${Math.min(result.filters.page, result.pages)} of ${result.pages}`} />
              <Metric label="Includes" value="Paid orders" />
            </>
          )}
        />

        <DataLoadNotice issues={result.error ? [result.error] : []} />

        <OrderFilters filters={result.filters} />

        {result.orders.length ? (
          <section className="mt-6 overflow-hidden rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)]">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-[var(--line-soft)] text-xs uppercase tracking-[0.14em] text-[var(--fg-muted-2)]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Order</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Order source</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Gross</th>
                    <th className="px-5 py-3 text-right font-medium">Net</th>
                    <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {result.orders.map((order) => <OrderTableRow key={order.id} order={order} locale={locale} />)}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[var(--line-soft)] md:hidden">
              {result.orders.map((order) => <OrderMobileCard key={order.id} order={order} locale={locale} />)}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={hasFilters ? Search : PackageCheck}
            title={hasFilters ? 'No orders match these filters' : 'Your first paid order will appear here'}
            ctas={hasFilters
              ? [{ label: 'Clear filters', href: '/dashboard/orders', variant: 'secondary' }]
              : [{ label: 'Review your listings', href: '/dashboard/listings' }]}
            className="mt-6"
          >
            {hasFilters
              ? 'Try a broader search or remove a status, order source, or currency filter.'
              : 'An order appears here only after Nexez records a payment. Simulator activity and abandoned checkouts are not included.'}
          </EmptyState>
        )}

        {result.total > 0 ? (
          <Pagination filters={result.filters} current={result.filters.page} pages={result.pages} />
        ) : null}
      </div>
    </main>
  )
}

function OrderFilters({ filters }: { filters: DashboardOrderFilters }) {
  return (
    <form method="get" className="mt-6 rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
        <Filter className="size-4 text-[var(--settings-emphasis)]" aria-hidden="true" /> Find an order
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,2fr)_1fr_1fr_0.8fr_auto]">
        <label className="relative block">
          <span className="sr-only">Search orders</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted-2)]" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Offer, customer, email, or reference"
            className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] pl-10 pr-3 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--settings-focus)]"
          />
        </label>
        <FilterSelect name="status" label="Status" value={filters.status} options={STATUS_OPTIONS} />
        <FilterSelect name="channel" label="Order source" value={filters.channel} options={CHANNEL_OPTIONS} />
        <label>
          <span className="sr-only">Currency</span>
          <input
            name="currency"
            defaultValue={filters.currency.toUpperCase()}
            inputMode="text"
            maxLength={3}
            placeholder="Currency"
            className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 text-sm uppercase text-[var(--fg)] outline-none placeholder:normal-case placeholder:text-[var(--fg-muted-2)] focus:border-[var(--settings-focus)]"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary min-h-11 flex-1 px-4 text-sm xl:flex-none">Apply</button>
          <Link href="/dashboard/orders" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--line-soft)] px-4 text-sm text-[var(--fg-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--fg)]">
            Reset
          </Link>
        </div>
      </div>
    </form>
  )
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string
  label: string
  value: string
  options: ReadonlyArray<readonly [string, string]>
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value} className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--settings-focus)]">
        <option value="">All {label === 'Status' ? 'statuses' : `${label.toLowerCase()}s`}</option>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  )
}

function OrderTableRow({ order, locale }: { order: DashboardOrder; locale: string }) {
  const economics = getOrderEconomics(order)
  return (
    <tr className="border-b border-[var(--line-soft)] last:border-0 hover:bg-[var(--fill-1)]">
      <td className="px-5 py-4">
        <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-[var(--fg)] hover:text-[var(--settings-emphasis)]">
          {order.offer_name || 'Order'}
        </Link>
        <p className="mt-1 font-mono text-[11px] text-[var(--fg-muted-2)]">#{shortOrderReference(order.id)} · {formatDisplayDate(order.created_at, locale)}</p>
      </td>
      <td className="px-5 py-4">
        <p className="max-w-[220px] truncate text-[var(--fg)]">{order.buyer_name || order.buyer_email || 'Customer details unavailable'}</p>
        {order.buyer_name && order.buyer_email ? <p className="mt-1 max-w-[220px] truncate text-xs text-[var(--fg-muted-2)]">{order.buyer_email}</p> : null}
      </td>
      <td className="px-5 py-4 text-[var(--fg-muted)]">
        <span>{getOrderChannelLabel(order.channel)}</span>
        <ModeLabel value={order.stripe_livemode} />
      </td>
      <td className="px-5 py-4"><OrderStatus order={order} /></td>
      <td className="px-5 py-4 text-right font-medium text-[var(--fg)]">{formatCurrencyAmount(economics.grossCents, order.currency, locale)}</td>
      <td className="px-5 py-4 text-right text-[var(--ready)]">{formatCurrencyAmount(economics.netCents, order.currency, locale)}</td>
      <td className="px-5 py-4 text-right">
        <Link href={`/dashboard/orders/${order.id}`} aria-label={`Open order ${shortOrderReference(order.id)}`} className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--line-soft)] text-[var(--fg-muted)] hover:border-[var(--settings-focus)] hover:text-[var(--fg)]">
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  )
}

function OrderMobileCard({ order, locale }: { order: DashboardOrder; locale: string }) {
  const economics = getOrderEconomics(order)
  return (
    <Link href={`/dashboard/orders/${order.id}`} className="block p-5 hover:bg-[var(--fill-1)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--fg)]">{order.offer_name || 'Order'}</p>
          <p className="mt-1 font-mono text-[11px] text-[var(--fg-muted-2)]">#{shortOrderReference(order.id)} · {formatDisplayDate(order.created_at, locale)}</p>
        </div>
        <OrderStatus order={order} />
      </div>
      <p className="mt-4 truncate text-sm text-[var(--fg-muted)]">{order.buyer_name || order.buyer_email || 'Customer details unavailable'}</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <span className="text-xs text-[var(--fg-muted-2)]">
          {getOrderChannelLabel(order.channel)}
          <ModeLabel value={order.stripe_livemode} />
        </span>
        <div className="text-right">
          <p className="font-medium text-[var(--fg)]">{formatCurrencyAmount(economics.grossCents, order.currency, locale)}</p>
          <p className="text-xs text-[var(--ready)]">{formatCurrencyAmount(economics.netCents, order.currency, locale)} net</p>
        </div>
      </div>
    </Link>
  )
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
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>{getOrderDisplayStatus(order)}</span>
}

function ModeLabel({ value }: { value: boolean | null }) {
  const label = value === true ? 'Live' : value === false ? 'Test' : 'Unverified'
  const classes = value === true
    ? 'border-[var(--ready)]/25 text-[var(--ready)]'
    : value === false
      ? 'border-[var(--amber)]/25 text-[var(--amber)]'
      : 'border-[var(--line-soft)] text-[var(--fg-muted-2)]'
  return <span className={`ml-2 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${classes}`}>{label}</span>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
      {label}: <strong className="font-medium text-[var(--fg)]">{value}</strong>
    </span>
  )
}

function Pagination({ filters, current, pages }: { filters: DashboardOrderFilters; current: number; pages: number }) {
  const safeCurrent = Math.min(current, pages)
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Order pages">
      <PaginationLink href={ordersHref(filters, safeCurrent - 1)} disabled={safeCurrent <= 1}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Previous
      </PaginationLink>
      <p className="text-sm text-[var(--fg-muted)]">Page {safeCurrent} of {pages}</p>
      <PaginationLink href={ordersHref(filters, safeCurrent + 1)} disabled={safeCurrent >= pages}>
        Next <ArrowRight className="size-4" aria-hidden="true" />
      </PaginationLink>
    </nav>
  )
}

function PaginationLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span aria-disabled="true" className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-3 text-sm text-[var(--fg-muted-2)] opacity-50">{children}</span>
  return <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-3 text-sm text-[var(--fg-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--fg)]">{children}</Link>
}

function ordersHref(filters: DashboardOrderFilters, page: number) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status) params.set('status', filters.status)
  if (filters.channel) params.set('channel', filters.channel)
  if (filters.currency) params.set('currency', filters.currency)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return `/dashboard/orders${query ? `?${query}` : ''}`
}
