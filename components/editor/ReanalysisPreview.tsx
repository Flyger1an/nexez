import { detectStripePriceChanges } from '../../lib/editor-merge'
import { PageEditor } from './usePageEditor'

export function ReanalysisPreview({ e }: { e: PageEditor }) {
  const pending = e.pendingReanalysis
  if (!pending) return null

  const stripeChanges = detectStripePriceChanges(e.servicesOffers, pending.incomingServices)

  return (
    <div className="rounded-xl border border-[var(--signal)]/30 bg-[#1A1625] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-[var(--signal)]">Re-analysis Preview</p>
          <p className="text-sm text-zinc-400">{pending.summary}</p>
          {pending.incomingServices?.some((o: any) => o.source) && (
            <p className="mt-1 text-[10px] text-[var(--signal)]">
              Includes offers from connected tools.
              {pending.incomingServices.some((o: any) => o.source === 'stripe') && ' Stripe prices compared below.'}
            </p>
          )}
          {stripeChanges.length > 0 && (
            <div className="mt-2 rounded border border-[var(--amber)]/20 bg-[var(--amber)]/5 p-2 text-[10px] text-[var(--amber)]">
              <div className="font-medium mb-1">Stripe price changes detected:</div>
              {stripeChanges.map((c, idx) => (
                <div key={idx}>• {c.name}: {c.old} → {c.new}</div>
              ))}
              <div className="mt-1 text-[9px] text-[var(--amber)]/80">Fresh prices from Stripe will be applied while your other edits stay protected.</div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => e.applyPendingReanalysis('all')}
            className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Apply All Changes
          </button>
          <button
            type="button"
            onClick={() => e.applyPendingReanalysis('new')}
            className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white hover:bg-white/10"
          >
            Add New Only
          </button>
          <button
            type="button"
            onClick={e.cancelPendingReanalysis}
            className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Smart merge protects edited descriptions, tiers, and per-offer "Book on original site" preferences while adding new fields and prices from connected tools.
      </p>
    </div>
  )
}
