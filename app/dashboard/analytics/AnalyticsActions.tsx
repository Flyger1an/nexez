'use client'

import React from 'react'

type Props = {
  selectedPage: any
  filteredEvents: any
  agentRevenueCents: number
  negotiationSummary: any
}

export default function AnalyticsActions({
  selectedPage,
  filteredEvents,
  agentRevenueCents,
  negotiationSummary,
}: Props) {
  const handleExportPdf = () => {
    const printWin = window.open('', '', 'height=600,width=800')
    if (printWin) {
      printWin.document.write(
        `<html><head><title>Nexez Analytics Report</title></head><body><h1>Analytics Report</h1><pre>${JSON.stringify(
          { revenue: agentRevenueCents, trust: 'see LLM report', negotiations: negotiationSummary },
          null,
          2
        )}</pre></body></html>`
      )
      printWin.document.close()
      printWin.focus()
      window.setTimeout(() => printWin.print(), 300)
    }
  }

  const handleGenerateTrust = async () => {
    try {
      const res = await fetch('/api/trust-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Scope to the page so the AI trust-report gates on the page OWNER's plan
        // (an editor-collaborator inherits it); page-less callers self-gate.
        body: JSON.stringify({ page: selectedPage, events: filteredEvents, pageId: selectedPage?.id }),
      })
      const data = await res.json()
      alert(`Trust Report (${data.score || 'N/A'}/100): ${data.report || 'Generated.'}`)
    } catch (e) {
      alert('Failed to generate LLM trust report.')
    }
  }

  return (
    <>
      <div className="mt-4">
        <button onClick={handleExportPdf} className="btn-secondary text-xs">
          Export Analytics as PDF (print)
        </button>
      </div>

      {/* Advanced: LLM Trust Report */}
      {selectedPage && (
        <section className="mt-6">
          <div className="min-w-0 rounded-lg border border-[var(--bd-10)] bg-[var(--ov-04)] p-5">
            <h2 className="text-xl font-semibold">LLM Trust Report (AI-powered insights)</h2>
            <div className="mt-4">
              <button onClick={handleGenerateTrust} className="btn-secondary text-xs">
                Generate LLM Trust Insights
              </button>
              <p className="mt-2 text-[10px] text-[var(--fg-muted-2)]">
                Uses configured LLM for actionable trust analysis based on score, signals, and activity. Improves with more events.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
