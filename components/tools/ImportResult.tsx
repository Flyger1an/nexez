'use client'

import type { ReactNode } from 'react'

// Shared result panel for the integration importers on the Tools page:
// renders an error, or a success message + "Create Page" handoff + offer preview.
export function ImportResult({
  result,
  onCreate,
  createClass,
  createLabel = 'Create Page →',
  defaultMessage = 'Import complete',
  maxOffers = 5,
  renderOffer,
  footer,
  wrapperClass = 'mt-3 rounded border border-white/10 bg-white/[0.03] p-3 text-sm',
}: {
  result: any
  onCreate: () => void
  createClass: string
  createLabel?: string
  defaultMessage?: string
  maxOffers?: number
  renderOffer: (offer: any, index: number) => ReactNode
  footer?: ReactNode
  wrapperClass?: string
}) {
  if (!result) return null

  return (
    <div className={wrapperClass}>
      {result.error ? (
        <p className="text-sm text-red-400">{result.error}</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-400">{result.message || defaultMessage}</p>
            {result.structuredOffers?.length > 0 && (
              <button onClick={onCreate} className={`rounded text-sm font-semibold text-zinc-950 ${createClass}`}>
                {createLabel}
              </button>
            )}
          </div>
          <div className="space-y-1 text-xs text-[#9CA3AF]">
            {result.structuredOffers?.slice(0, maxOffers).map(renderOffer)}
          </div>
          {footer}
        </>
      )}
    </div>
  )
}
