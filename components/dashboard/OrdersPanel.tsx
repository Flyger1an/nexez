'use client'

import { useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { formatCurrencyAmount } from '../../lib/currency'

export type OrderRow = {
  id: string
  offer_name: string | null
  amount_cents: number
  currency: string
  status: string
  slug: string | null
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'text-[var(--ready)] border-[var(--ready)]/30 bg-[var(--ready)]/10',
  refunded: 'text-zinc-400 border-white/15 bg-white/5',
  disputed: 'text-[var(--amber)] border-[var(--amber)]/30 bg-[var(--amber)]/10',
  dispute_won: 'text-[var(--ready)] border-[var(--ready)]/30 bg-[var(--ready)]/10',
}

/** Direct-checkout orders with an in-app full-refund action (negotiated deals are
 *  refunded from the Negotiations inbox). Inline two-step confirm — no window.confirm. */
export function OrdersPanel({ orders }: { orders: OrderRow[] }) {
  const [rows, setRows] = useState(orders)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')

  if (!orders.length) return null

  async function refund(id: string) {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch('/api/orders/refund', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'Refund failed.')
        return
      }
      setConfirmId(null)
      setRows((r) => r.map((o) => (o.id === id ? { ...o, status: 'refunded' } : o)))
    } catch {
      setError('Refund failed — try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="nx-rise mt-8">
      <h2 className="text-lg font-semibold">Direct orders</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Checkout sales (not negotiated). A refund returns the buyer the full amount and gives Nexez&rsquo;s commission back too.
      </p>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr className="border-b border-white/10">
              <th className="px-4 py-2 font-medium">Offer</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">
                  <span className="text-zinc-200">{o.offer_name || 'Offer'}</span>
                  {o.slug ? <span className="ml-2 text-xs text-zinc-500">/{o.slug}</span> : null}
                </td>
                <td className="px-4 py-3 text-zinc-200">{formatCurrencyAmount(o.amount_cents, o.currency)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[o.status] || 'border-white/15 text-zinc-400'}`}>
                    {o.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {o.status !== 'paid' ? (
                    <span className="text-xs text-zinc-600">—</span>
                  ) : confirmId === o.id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Refund in full?</span>
                      <button type="button" onClick={() => refund(o.id)} disabled={busyId === o.id} className="rounded-lg border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-400/20 disabled:opacity-50">
                        {busyId === o.id ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirm'}
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(o.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5">
                      <RotateCcw className="size-3.5" /> Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
