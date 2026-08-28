'use client'

import { useState } from 'react'
import type { AgentPage } from '../../../lib/agent-page'

type Props = {
  selectedPage: AgentPage | null
}

export default function AnalyticsActions({ selectedPage }: Props) {
  const [report, setReport] = useState<{ score: number | null; text: string } | null>(null)
  const [reportError, setReportError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGenerateTrust = async () => {
    setLoading(true)
    setReportError('')
    try {
      const res = await fetch('/api/trust-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Scope to the page so the AI trust-report gates on the page OWNER's plan
        // (an editor-collaborator inherits it); page-less callers self-gate.
        body: JSON.stringify({ page: selectedPage, pageId: selectedPage?.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not generate trust insights.')
      setReport({
        score: typeof data.score === 'number' ? data.score : null,
        text: typeof data.report === 'string' ? data.report : 'Trust insights generated.',
      })
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not generate trust insights.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="mt-4">
        <button onClick={() => window.print()} className="btn-secondary text-xs">
          Print analytics report
        </button>
      </div>

      {/* Advanced: LLM Trust Report */}
      {selectedPage && (
        <section className="mt-6">
          <div className="min-w-0 rounded-lg border border-[var(--bd-10)] bg-[var(--ov-04)] p-5">
            <h2 className="text-xl font-semibold">AI trust report</h2>
            <div className="mt-4">
              <button onClick={handleGenerateTrust} disabled={loading} className="btn-secondary text-xs disabled:cursor-wait disabled:opacity-60">
                {loading ? 'Generating…' : 'Generate trust insights'}
              </button>
              <p className="mt-2 text-[10px] text-[var(--fg-muted-2)]">
                Summarizes trust gaps and next steps using your configured AI model.
              </p>
              {report ? (
                <div className="mt-4 rounded-lg border border-[var(--ready)]/20 bg-[var(--ready)]/[0.06] p-4" role="status">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--ready)]">
                    Trust score {report.score == null ? 'available' : `${report.score}/100`}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-300">{report.text}</p>
                </div>
              ) : null}
              {reportError ? <p className="mt-3 text-sm text-red-300" role="alert">{reportError}</p> : null}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
