import Link from 'next/link'
import { cookies } from 'next/headers'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  CircleDollarSign,
  Filter,
  Handshake,
  Layers3,
  PackageCheck,
  Search,
} from 'lucide-react'
import { createClient } from '../../../utils/supabase/server'
import { SurfaceHeader } from '../../../components/dashboard/SurfacePrimitives'
import { DataLoadNotice } from '../../../components/dashboard/DataLoadNotice'
import { EmptyState } from '../../../components/EmptyState'
import { formatCurrencyAmount } from '../../../lib/currency'
import type { CommerceActionRecord } from '../../../lib/commerce-actions'
import type { CommerceRecord, CommerceStatus, CommerceTone } from '../../../lib/commerce-record'
import {
  DASHBOARD_COMMERCE_ACTION_LIMIT,
  loadDashboardCommerceActions,
  type DashboardCommerceActionResult,
} from '../../../lib/server/dashboard-commerce-actions'
import {
  DASHBOARD_COMMERCE_LIMIT,
  loadDashboardCommerce,
  type DashboardCommerceFilters,
} from '../../../lib/server/dashboard-commerce'

type CommercePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CommercePage({ searchParams }: CommercePageProps) {
  const [cookieStore, rawFilters] = await Promise.all([cookies(), searchParams])
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-[var(--fg)]">
        <Link href="/login?next=/dashboard/commerce" className="btn-primary min-h-11 px-5 py-3">
          Sign in to view commerce
        </Link>
      </main>
    )
  }

  const [result, actionResult] = await Promise.all([
    loadDashboardCommerce(supabase, user.id, rawFilters),
    loadDashboardCommerceActions(supabase, user.id),
  ])
  const hasFilters = Boolean(result.filters.q || result.filters.rail || result.filters.currency)
  const issues = [...new Set([...result.issues, ...actionResult.issues])]

  return (
    <main data-testid="commerce-dashboard" className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <SurfaceHeader
          eyebrow="Orders and deals"
          icon={Layers3}
          title="Commerce"
          description="Review orders, negotiated deals, payments, and tasks in one place. Open any item to manage it in the right workflow."
          actions={(
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/orders" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--fill-1)]">
                <PackageCheck className="size-4" aria-hidden="true" /> Manage orders
              </Link>
              <Link href="/dashboard/negotiations" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--fill-1)]">
                <Handshake className="size-4" aria-hidden="true" /> Open negotiations
              </Link>
            </div>
          )}
          footer={(
            <>
              <Metric label="Orders" value={formatRailCount(result.checkoutCount, result.filters.rail === 'negotiated')} />
              <Metric label="Negotiated deals" value={formatRailCount(result.negotiatedCount, result.filters.rail === 'checkout')} />
              <Metric label="Tasks" value={String(actionResult.actions.length)} />
              <Metric label="Urgent" value={String(actionResult.urgentCount)} />
              <Metric label="Updated from" value="Orders and deals" />
            </>
          )}
        />

        <DataLoadNotice issues={issues} />

        <CommerceActionQueue result={actionResult} />

        <section className="mt-6 rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-[var(--settings-emphasis)]" aria-hidden="true" />
            <div>
              <h2 className="font-medium text-[var(--fg)]">Orders and deals stay separate</h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--fg-muted)]">
                Order totals are recorded payments. Deal totals remain proposed or agreed values until Nexez records a payment. Fulfillment is shown only for orders that can be fulfilled in Nexez.
              </p>
            </div>
          </div>
        </section>

        <CommerceFilters filters={result.filters} />

        {result.records.length ? (
          <>
            <section className="mt-6 overflow-hidden rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)]">
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1120px] text-left text-sm">
                  <thead className="border-b border-[var(--line-soft)] text-xs uppercase tracking-[0.14em] text-[var(--fg-muted-2)]">
                    <tr>
                      <th className="px-5 py-3 font-medium">Order or deal</th>
                      <th className="px-5 py-3 font-medium">Customer</th>
                      <th className="px-5 py-3 font-medium">Sale type</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Payment status</th>
                      <th className="px-5 py-3 text-right font-medium">Value</th>
                      <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.records.map((record) => <CommerceTableRow key={record.key} record={record} />)}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-[var(--line-soft)] lg:hidden">
                {result.records.map((record) => <CommerceCard key={record.key} record={record} />)}
              </div>
            </section>
            {result.total > result.records.length ? (
              <p className="mt-4 text-sm text-[var(--fg-muted-2)]">
                Showing the {DASHBOARD_COMMERCE_LIMIT} most recently updated results. Filter by sale type, currency, or search to narrow the list.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={hasFilters ? Search : Layers3}
            title={hasFilters ? 'No orders or deals match these filters' : 'Orders and deals will appear here'}
            ctas={hasFilters
              ? [{ label: 'Clear filters', href: '/dashboard/commerce', variant: 'secondary' }]
              : [{ label: 'Review your listings', href: '/dashboard/listings' }]}
            className="mt-6"
          >
            {hasFilters
              ? 'Try a broader search or remove the sale type or currency filter.'
              : 'Nexez adds paid orders and real customer negotiations here. Simulator activity and abandoned checkouts are not included.'}
          </EmptyState>
        )}
      </div>
    </main>
  )
}

function CommerceActionQueue({ result }: { result: DashboardCommerceActionResult }) {
  return (
    <section aria-labelledby="commerce-action-queue" className="mt-6 overflow-hidden rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)]">
      <div className="flex flex-col gap-4 border-b border-[var(--line-soft)] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 size-5 shrink-0 text-[var(--settings-emphasis)]" aria-hidden="true" />
          <div>
            <h2 id="commerce-action-queue" className="font-medium text-[var(--fg)]">Tasks that need attention</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
              Review disputes, customer requests, fulfillment tasks, and deals waiting for a response. Each task opens the order or deal where you can act.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 py-1.5 text-[var(--fg-muted)]">
            {result.actions.length} visible
          </span>
          {result.urgentCount ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-red-300">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> {result.urgentCount} urgent
            </span>
          ) : null}
        </div>
      </div>

      {result.actions.length ? (
        <div className="divide-y divide-[var(--line-soft)]">
          {result.actions.map((action) => <CommerceActionRow key={action.key} action={action} />)}
        </div>
      ) : (
        <div className="p-6">
          <p className="font-medium text-[var(--fg)]">
            {result.issues.length ? 'No tasks are available right now' : 'You are all caught up'}
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
            {result.issues.length
              ? 'Nexez could not check every task source. See the notice above for details.'
              : 'New tasks will appear when an order or deal needs your attention.'}
          </p>
        </div>
      )}

      {result.isTruncated ? (
        <p className="border-t border-[var(--line-soft)] px-5 py-3 text-xs leading-5 text-[var(--fg-muted-2)]">
          Showing the {DASHBOARD_COMMERCE_ACTION_LIMIT} highest-priority tasks. Open Orders or Negotiations to see everything.
        </p>
      ) : null}
    </section>
  )
}

function CommerceActionRow({ action }: { action: CommerceActionRecord }) {
  const record = action.record
  return (
    <Link href={record.href} className="group grid gap-4 p-5 hover:bg-[var(--fill-1)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${action.urgent ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'}`}>
            {action.primaryAction.label}
          </span>
          <span className="text-xs text-[var(--fg-muted-2)]">{record.railLabel} · {modeLabel(record.mode)}</span>
        </div>
        <p className="mt-3 truncate font-medium text-[var(--fg)]">{record.offerName}</p>
        <p className="mt-1 truncate text-sm text-[var(--fg-muted)]">{record.buyerLabel}</p>
      </div>
      <div>
        <p className="text-sm leading-6 text-[var(--fg-muted)]">{action.primaryAction.detail}</p>
        {action.actions.length > 1 ? (
          <p className="mt-1 text-xs text-[var(--fg-muted-2)]">
            +{action.actions.length - 1} additional action {action.actions.slice(1).map((item) => item.label.toLowerCase()).join(', ')}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4 lg:justify-end">
        <span className="text-xs text-[var(--fg-muted-2)]">Updated {formatDate(action.primaryAction.updatedAt)}</span>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--line-soft)] text-[var(--fg-muted)] group-hover:border-[var(--settings-focus)] group-hover:text-[var(--fg)]">
          <ArrowRight className="size-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}

function CommerceFilters({ filters }: { filters: DashboardCommerceFilters }) {
  return (
    <form method="get" className="mt-6 rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
        <Filter className="size-4 text-[var(--settings-emphasis)]" aria-hidden="true" /> Find an order or deal
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,2fr)_1fr_0.8fr_auto]">
        <label className="relative block">
          <span className="sr-only">Search orders and deals</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted-2)]" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Offer, customer, email, or reference"
            className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] pl-10 pr-3 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--settings-focus)]"
          />
        </label>
        <label>
          <span className="sr-only">Sale type</span>
          <select name="rail" defaultValue={filters.rail} className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--settings-focus)]">
            <option value="">All sale types</option>
            <option value="checkout">Orders</option>
            <option value="negotiated">Negotiated deals</option>
          </select>
        </label>
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
          <Link href="/dashboard/commerce" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--line-soft)] px-4 text-sm text-[var(--fg-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--fg)]">
            Reset
          </Link>
        </div>
      </div>
    </form>
  )
}

function CommerceTableRow({ record }: { record: CommerceRecord }) {
  return (
    <tr className="border-b border-[var(--line-soft)] last:border-0 hover:bg-[var(--fill-1)]">
      <td className="px-5 py-4">
        <Link href={record.href} className="font-medium text-[var(--fg)] hover:text-[var(--settings-emphasis)]">
          {record.offerName}
        </Link>
        <p className="mt-1 font-mono text-[11px] text-[var(--fg-muted-2)]">#{shortReference(record.id)} · {formatDate(record.updatedAt)}</p>
      </td>
      <td className="px-5 py-4">
        <p className="max-w-[220px] truncate text-[var(--fg)]">{record.buyerLabel}</p>
        {record.buyerEmail && record.buyerEmail !== record.buyerLabel ? <p className="mt-1 max-w-[220px] truncate text-xs text-[var(--fg-muted-2)]">{record.buyerEmail}</p> : null}
      </td>
      <td className="px-5 py-4">
        <p className="text-[var(--fg)]">{record.railLabel}</p>
        <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{record.channelLabel} · {modeLabel(record.mode)}</p>
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={record.sourceStatus} />
        {record.fulfillmentState ? <p className="mt-2 text-xs text-[var(--fg-muted-2)]">Fulfillment: {record.fulfillmentState.label}</p> : null}
      </td>
      <td className="px-5 py-4"><StatusBadge status={record.paymentState} /></td>
      <td className="px-5 py-4 text-right">
        <p className="font-medium text-[var(--fg)]">{formatRecordAmount(record)}</p>
        <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{record.amountLabel}</p>
      </td>
      <td className="px-5 py-4 text-right">
        <Link href={record.href} aria-label={`${record.actionLabel} ${shortReference(record.id)}`} className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--line-soft)] text-[var(--fg-muted)] hover:border-[var(--settings-focus)] hover:text-[var(--fg)]">
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  )
}

function CommerceCard({ record }: { record: CommerceRecord }) {
  return (
    <Link href={record.href} className="block p-5 hover:bg-[var(--fill-1)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--fg)]">{record.offerName}</p>
          <p className="mt-1 font-mono text-[11px] text-[var(--fg-muted-2)]">#{shortReference(record.id)} · {formatDate(record.updatedAt)}</p>
        </div>
        <StatusBadge status={record.sourceStatus} />
      </div>
      <p className="mt-4 truncate text-sm text-[var(--fg-muted)]">{record.buyerLabel}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[var(--fg-muted-2)]">Sale type</p>
          <p className="mt-1 text-[var(--fg)]">{record.railLabel}</p>
        </div>
        <div>
          <p className="text-[var(--fg-muted-2)]">Payment status</p>
          <p className="mt-1 text-[var(--fg)]">{record.paymentState.label}</p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <span className="text-xs text-[var(--fg-muted-2)]">{record.channelLabel} · {modeLabel(record.mode)}</span>
        <div className="text-right">
          <p className="font-medium text-[var(--fg)]">{formatRecordAmount(record)}</p>
          <p className="text-xs text-[var(--fg-muted-2)]">{record.amountLabel}</p>
        </div>
      </div>
    </Link>
  )
}

function StatusBadge({ status }: { status: CommerceStatus }) {
  const classes: Record<CommerceTone, string> = {
    ready: 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
    attention: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
    danger: 'border-red-400/30 bg-red-400/10 text-red-300',
    signal: 'border-[var(--signal)]/30 bg-[var(--signal)]/10 text-[var(--signal)]',
    muted: 'border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--fg-muted)]',
  }
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${classes[status.tone]}`}>{status.label}</span>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[140px]">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--fg)]">{value}</p>
    </div>
  )
}

function formatRecordAmount(record: CommerceRecord) {
  return record.amountCents == null ? 'Not set' : formatCurrencyAmount(record.amountCents, record.currency)
}

function shortReference(id: string) {
  return id.slice(-8).toUpperCase()
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function modeLabel(value: CommerceRecord['mode']) {
  return value === 'live' ? 'Live' : value === 'test' ? 'Test' : 'Mode unverified'
}

function formatRailCount(value: number | null, excludedByFilter: boolean) {
  if (excludedByFilter) return 'Not queried'
  return value == null ? 'Unavailable' : String(value)
}
