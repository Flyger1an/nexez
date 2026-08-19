'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, CircleDollarSign, RefreshCcw, ShieldCheck, XCircle } from 'lucide-react'

type Occurrence = {
  id: string
  status: string
  amountCents: number
  currency: string
  invoiceId: string | null
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  paidAt: string
  orderPath: string | null
}

type Agreement = {
  id: string
  sellerName: string | null
  slug: string | null
  offerKey: string
  offerName: string
  status: string
  contract: {
    resolvedSchedule?: { interval?: string; intervalCount?: number; source?: string; inputValue?: string }
    configuration?: Record<string, unknown>
  }
  amountPerPeriod: number
  currency: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  startedAt: string | null
  canceledAt: string | null
  createdAt: string
  buyerReference: string | null
  pauseSupported: false
  occurrences: Occurrence[]
}

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
  }
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available yet'
}

function cadence(agreement: Agreement) {
  const schedule = agreement.contract.resolvedSchedule
  if (!schedule?.interval || !schedule.intervalCount) return 'Recurring schedule'
  if (schedule.inputValue) return schedule.inputValue.replace(/[-_]+/g, ' ')
  const unit = schedule.intervalCount === 1 ? schedule.interval : `${schedule.interval}s`
  return schedule.intervalCount === 1 ? `Every ${unit}` : `Every ${schedule.intervalCount} ${unit}`
}

export function AgreementPortal({ token }: { token: string }) {
  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let active = true
    void fetch(`/api/service-agreements/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return
        if (!response.ok) {
          setError(response.status === 404 ? 'This recurring-service link is invalid or unavailable.' : 'Could not load this recurring service.')
          return
        }
        setAgreement(await response.json() as Agreement)
        setError(null)
      })
      .catch(() => {
        if (active) setError('Could not reach Nexez to load this recurring service.')
      })
    return () => {
      active = false
    }
  }, [token])

  async function update(action: 'cancel' | 'resume') {
    setWorking(true)
    setError(null)
    try {
      const response = await fetch(`/api/service-agreements/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await response.json()
      if (!response.ok) setError(body.error || 'Could not update this recurring service.')
      else setAgreement(body as Agreement)
    } catch {
      setError('Could not reach Nexez to update this recurring service.')
    } finally {
      setWorking(false)
    }
  }

  if (!agreement && !error) {
    return (
      <main className="min-h-screen bg-[#090b10] text-white">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6 text-sm text-zinc-400">
          Loading your recurring service…
        </div>
      </main>
    )
  }

  if (!agreement) {
    return (
      <main className="min-h-screen bg-[#090b10] text-white">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <XCircle className="size-10 text-zinc-500" />
          <h1 className="mt-5 text-2xl font-semibold">Agreement unavailable</h1>
          <p className="mt-3 text-sm text-zinc-400">{error}</p>
        </div>
      </main>
    )
  }

  const canManage = Boolean(agreement.startedAt) && agreement.status !== 'canceled'
  const periodEnding = agreement.cancelAtPeriodEnd

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {agreement.slug ? (
          <a href={`/${agreement.slug}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" /> {agreement.sellerName || 'Back to seller'}
          </a>
        ) : null}

        <header className="mt-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
              <RefreshCcw className="size-4" /> Recurring service agreement
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{agreement.offerName}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {agreement.sellerName ? `From ${agreement.sellerName}` : 'Nexez recurring service'}
            </p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-medium capitalize text-zinc-200">
            {agreement.status.replace(/_/g, ' ')}
          </span>
        </header>

        <section className="mt-6 card !p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail icon={<CircleDollarSign className="size-4" />} label="Per service period" value={money(agreement.amountPerPeriod, agreement.currency)} />
            <Detail icon={<CalendarClock className="size-4" />} label="Cadence" value={cadence(agreement)} />
            <Detail label="Current period starts" value={date(agreement.currentPeriodStart)} />
            <Detail label="Current period ends" value={date(agreement.currentPeriodEnd)} />
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-white">
              <ShieldCheck className="size-4 text-[var(--ready)]" /> Buyer control
            </p>
            <p className="mt-2 leading-6 text-zinc-400">
              Cancellation takes effect at the end of the current paid service period. Nexez recurring-service v1 does not expose a fake pause: no future service period is presented as paused while billing semantics continue underneath.
            </p>
            {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            {canManage ? (
              <button
                type="button"
                disabled={working}
                onClick={() => void update(periodEnding ? 'resume' : 'cancel')}
                className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {working ? 'Updating…' : periodEnding ? 'Keep recurring service active' : 'Cancel at period end'}
              </button>
            ) : agreement.status === 'canceled' ? (
              <p className="mt-3 text-sm text-zinc-400">This agreement has ended and cannot be resumed.</p>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">The first successful subscription payment is still being finalized.</p>
            )}
          </div>
        </section>

        <section className="mt-6 card !p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5 text-[var(--signal)]" /> Paid service periods
          </h2>
          {agreement.occurrences.length ? (
            <ul className="mt-4 space-y-3">
              {agreement.occurrences.map((occurrence) => (
                <li key={occurrence.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-zinc-100">{money(occurrence.amountCents, occurrence.currency)}</span>
                    <span className="capitalize text-zinc-400">{occurrence.status.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-2 text-zinc-400">
                    {date(occurrence.servicePeriodStart)} → {date(occurrence.servicePeriodEnd)}
                  </p>
                  {occurrence.orderPath ? (
                    <a href={occurrence.orderPath} className="mt-3 inline-flex text-xs font-medium text-[var(--signal)] hover:underline">
                      Manage, refund, or report this paid period
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">No paid service period has been recorded yet.</p>
          )}
        </section>
      </div>
    </main>
  )
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">{icon}{label}</p>
      <p className="mt-2 text-sm font-medium capitalize text-zinc-100">{value}</p>
    </div>
  )
}