'use client'

interface FunnelProps {
  views: number
  attempts: number
  conversions: number
}

export function ConversionFunnel({ views, attempts, conversions }: FunnelProps) {
  const max = Math.max(views, attempts, conversions, 1)

  const stages = [
    { label: 'Agent Page Views', value: views, color: 'var(--signal)' },
    { label: 'Checkout Intent', value: attempts, color: 'var(--signal)' },
    { label: 'Conversions', value: conversions, color: 'var(--ready)' },
  ]

  return (
    <div className="space-y-3 pt-2">
      {stages.map((stage, index) => {
        const width = Math.max(12, Math.round((stage.value / max) * 100))
        const prev = index > 0 ? stages[index - 1].value : 0
        const rate = index > 0 ? (prev > 0 ? ((stage.value / prev) * 100).toFixed(1) : '0') : '100'

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
                {rate}%
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}