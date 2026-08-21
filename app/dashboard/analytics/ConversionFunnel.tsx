'use client'

interface FunnelProps {
  visits: number
  attempts: number
  starts: number
  paid: number
  retained: number
  attributionComplete: boolean
}

export function ConversionFunnel({ visits, attempts, starts, paid, retained, attributionComplete }: FunnelProps) {
  const max = Math.max(visits, attempts, starts, paid, retained, 1)

  const stages = [
    { label: 'Listing visits', value: visits, color: 'var(--signal)' },
    { label: 'Checkout intent', value: attempts, color: 'var(--signal)' },
    { label: 'Checkout starts', value: starts, color: 'var(--amber)' },
    { label: 'Paid direct', value: paid, color: 'var(--ready)' },
    { label: 'Payment retained', value: retained, color: 'var(--ready)' },
  ]

  return (
    <div className="space-y-3 pt-2">
      {stages.map((stage, index) => {
        const width = Math.max(12, Math.round((stage.value / max) * 100))
        const prev = index > 0 ? stages[index - 1].value : 0
        const rate = index > 0 && prev > 0 ? `${((stage.value / prev) * 100).toFixed(1)}%` : '—'

        return (
          <div key={index} className="flex items-center gap-3 text-sm">
            <div className="w-28 shrink-0 text-right text-[var(--fg-muted)]">{stage.label}</div>
            <div className="flex-1">
              <div className="h-6 rounded-full bg-white/10 overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all flex items-center justify-end pr-2 text-xs font-medium text-white"
                  style={{ 
                    width: `${width}%`, 
                    backgroundColor: stage.color,
                    opacity: index === 0 ? 0.9 : 0.75 
                  }}
                >
                  {stage.value.toLocaleString()}
                </div>
              </div>
            </div>
            {index > 0 && (
              <div className="w-14 text-right text-xs text-[var(--fg-muted-2)]">
                {rate}
              </div>
            )}
          </div>
        )
      })}
      {!attributionComplete ? (
        <p className="rounded-md border border-[var(--amber)]/20 bg-[var(--amber)]/[0.06] px-3 py-2 text-xs leading-5 text-zinc-400">
          Some payments fall outside the matching checkout-start window, so the paid rate is withheld instead of displaying a misleading percentage.
        </p>
      ) : null}
    </div>
  )
}
