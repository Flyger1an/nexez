'use client'

import {
  ArrowRight,
  Bot,
  CircleCheck,
  ClipboardList,
  Download,
  ShieldAlert,
  Wallet,
} from 'lucide-react'
import { formatCurrencyAmount } from '../../lib/currency'
import {
  commercialSnapshotCsv,
  type CommercialAction,
  type CommercialCommandCenter as CommercialSnapshot,
} from '../../lib/commercial-command-center'

export function CommercialCommandCenter({ snapshot }: { snapshot: CommercialSnapshot }) {
  const completeSnapshot = Object.values(snapshot.availability).every(Boolean)
    && snapshot.commerce.complete
    && !snapshot.commerce.isTruncated
  const statusCopy = snapshot.status === 'critical'
    ? 'Urgent items need review'
    : snapshot.status === 'incomplete'
      ? 'Some live totals are unavailable'
    : snapshot.status === 'attention'
      ? 'Your action queue is ready'
      : 'Commercial operations are clear'
  const statusClass = snapshot.status === 'critical'
    ? 'border-red-300/30 bg-red-300/10 text-red-200'
    : snapshot.status === 'incomplete'
      ? 'border-[var(--signal)]/30 bg-[var(--signal)]/10 text-[var(--signal)]'
    : snapshot.status === 'attention'
      ? 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'
      : 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]'
  const commerceDetail = snapshot.availability.commerce
    ? [
        `${snapshot.commerce.urgentActions.toLocaleString()} urgent`,
        snapshot.availability.negotiations
          ? `${snapshot.deals.needsAction.toLocaleString()} negotiated`
          : 'negotiation total unavailable',
        snapshot.commerce.complete ? null : 'partial source coverage',
        snapshot.commerce.isTruncated ? 'bounded view, more may exist' : null,
      ].filter(Boolean).join(' · ')
    : 'The cross-rail action queue is temporarily unavailable.'

  function exportSnapshot() {
    const blob = new Blob([commercialSnapshotCsv(snapshot)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `nexez-commercial-snapshot-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section
      aria-labelledby="commercial-command-center-title"
      className="relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[var(--signal)]/10 blur-3xl" />
      <header className="relative flex flex-col gap-5 border-b border-white/10 p-5 md:flex-row md:items-end md:justify-between md:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--signal)]">Commercial command center</p>
          <h2 id="commercial-command-center-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white md:text-3xl">
            Demand, operations, and money in one view
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">
            Today&apos;s verified demand, the cross-rail action queue, and 30-day settled sales stay distinct and link back to their native records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium ${statusClass}`}>
            {snapshot.status === 'ready' ? <CircleCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
            {statusCopy}
          </span>
          <button
            type="button"
            onClick={exportSnapshot}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
          >
            <Download className="size-3.5" /> {completeSnapshot ? 'Export snapshot' : 'Export available data'}
          </button>
        </div>
      </header>

      <div
        data-testid="commercial-command-cards"
        className="relative grid gap-px bg-[var(--bd-10)] lg:grid-cols-3"
      >
        <CommandCard
          href="/dashboard/analytics?range=today"
          eyebrow="Demand · today"
          icon={<Bot className="size-4" />}
          value={snapshot.availability.analytics ? snapshot.demand.aiVisits.toLocaleString() : '—'}
          label="AI agent visits"
          detail={snapshot.availability.analytics
            ? `${snapshot.demand.discoveryClicks.toLocaleString()} discovery clicks · ${snapshot.demand.checkoutStarts.toLocaleString()} checkout starts`
            : 'Analytics totals are temporarily unavailable.'}
          accent="signal"
        />
        <CommandCard
          href="/dashboard/commerce"
          eyebrow="Commerce · current"
          icon={<ClipboardList className="size-4" />}
          value={snapshot.availability.commerce ? snapshot.commerce.visibleActions.toLocaleString() : '—'}
          label="visible records need action"
          detail={commerceDetail}
          accent={snapshot.commerce.urgentActions ? 'critical' : snapshot.commerce.visibleActions ? 'amber' : 'ready'}
        />
        <CommandCard
          href="/dashboard/finance?range=30d"
          eyebrow="Money · 30 days"
          icon={<Wallet className="size-4" />}
          value={snapshot.availability.finance
            ? formatCurrencyAmount(snapshot.primaryMoney.netCents, snapshot.primaryMoney.currency)
            : '—'}
          label="net settled sales"
          detail={snapshot.availability.finance
            ? `${formatCurrencyAmount(snapshot.primaryMoney.grossCents, snapshot.primaryMoney.currency)} gross · ${snapshot.primaryMoney.directTransactions + snapshot.primaryMoney.negotiatedDeals} settled ${snapshot.primaryMoney.directTransactions + snapshot.primaryMoney.negotiatedDeals === 1 ? 'sale' : 'sales'}`
            : 'Finance totals are temporarily unavailable.'}
          accent="ready"
        />
      </div>

      <div className="relative p-5 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Needs you</p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {snapshot.actions.length ? `${snapshot.actions.length} active ${snapshot.actions.length === 1 ? 'signal' : 'signals'}` : 'Nothing is blocking the next sale'}
            </h3>
          </div>
          <p className="text-xs text-zinc-500">Categories can overlap; counts are never added into a misleading total.</p>
        </div>

        {snapshot.actions.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.actions.map((action) => <ActionCard key={action.id} action={action} />)}
          </div>
        ) : completeSnapshot ? (
          <div className="mt-4 flex min-h-24 items-center gap-3 rounded-xl border border-[var(--ready)]/20 bg-[var(--ready)]/[0.06] p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ready)]/10 text-[var(--ready)]">
              <CircleCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-white">You&apos;re caught up</p>
              <p className="mt-1 text-sm text-zinc-400">No commerce, money, or listing-readiness exception needs attention right now.</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex min-h-24 items-center gap-3 rounded-xl border border-[var(--amber)]/20 bg-[var(--amber)]/[0.06] p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--amber)]/10 text-[var(--amber)]">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-white">No actions surfaced from the available sources</p>
              <p className="mt-1 text-sm text-zinc-400">One or more live sources could not be checked, so this is not an all-clear state.</p>
            </div>
          </div>
        )}

        {snapshot.money.length > 1 ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5 text-xs text-zinc-500">
            <span>Currency-safe reporting:</span>
            {snapshot.money.map((row) => (
              <span key={row.currency} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-zinc-300">
                {row.currency.toUpperCase()} {formatCurrencyAmount(row.netCents, row.currency)} net
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function CommandCard({
  href,
  eyebrow,
  icon,
  value,
  label,
  detail,
  accent,
}: {
  href: string
  eyebrow: string
  icon: React.ReactNode
  value: string
  label: string
  detail: string
  accent: 'signal' | 'amber' | 'ready' | 'critical'
}) {
  const color = accent === 'signal'
    ? 'text-[var(--signal)]'
    : accent === 'amber'
      ? 'text-[var(--amber)]'
      : accent === 'critical'
        ? 'text-red-300'
        : 'text-[var(--ready)]'
  return (
    <a href={href} className="group min-h-48 bg-[var(--bg-2)] p-5 transition-shadow hover:shadow-[inset_0_0_0_1px_var(--line-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--signal)] md:p-6">
      <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] ${color}`}>{icon}{eyebrow}</div>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-3xl font-semibold tracking-[-0.04em] text-[var(--fg)] md:text-4xl">{value}</span>
        <ArrowRight className="mb-1 size-4 text-[var(--fg-muted-2)] transition group-hover:translate-x-1 group-hover:text-[var(--fg)]" />
      </div>
      <p className="mt-1 text-sm font-medium text-[var(--fg-soft)]">{label}</p>
      <p className="mt-3 text-xs leading-5 text-[var(--fg-muted-2)]">{detail}</p>
    </a>
  )
}

function ActionCard({ action }: { action: CommercialAction }) {
  const tone = action.tone === 'critical'
    ? 'border-red-300/20 bg-red-300/[0.06] text-red-200'
    : action.tone === 'attention'
      ? 'border-[var(--amber)]/20 bg-[var(--amber)]/[0.06] text-[var(--amber)]'
      : action.tone === 'accuracy'
        ? 'border-[var(--signal)]/20 bg-[var(--signal)]/[0.06] text-[var(--signal)]'
        : 'border-[var(--signal)]/20 bg-[var(--signal)]/[0.06] text-[var(--signal)]'

  return (
    <a href={action.href} className={`group flex min-h-36 flex-col rounded-xl border p-4 transition hover:-translate-y-0.5 hover:border-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-white">{action.label}</p>
        <span className="rounded-full border border-current/20 px-2 py-0.5 font-mono text-xs">{action.count}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{action.detail}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium">
        {action.cta}<ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
      </span>
    </a>
  )
}
