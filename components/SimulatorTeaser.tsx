'use client'

import { useState } from 'react'
import { appUrl } from '../lib/site'

type SimOffer = {
  key: string
  type: 'service' | 'product'
  name: string
  price: string | null
  description: string | null
  checkoutUrl: string
  bestMatch: boolean
}

type SimResponse = {
  intent: string
  intentLabel: string
  naturalLanguage: string
  readiness: number
  confidence: number
  offers: SimOffer[]
  agentActions: string[]
  recommendations: string[]
}

const PRESETS = [
  'Can an agent book a 60 minute session next week?',
  'How much does strategy work cost here?',
  'Is this a good fit for a scaling startup?',
  'What products can I buy right now?',
]

export function SimulatorTeaser() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SimResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'natural' | 'structured'>('natural')

  const handleSimulate = async (customQuery?: string) => {
    const q = (customQuery || query).trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/public-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Simulation failed')

      setResult({
        intent: data.intent,
        intentLabel: data.intentLabel,
        naturalLanguage: data.naturalLanguage,
        readiness: data.readiness,
        confidence: data.confidence,
        offers: data.offers || [],
        agentActions: data.agentActions || [],
        recommendations: data.recommendations || [],
      })
      setQuery(q)
      setActiveTab('natural')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl text-left">
      {/* Preset queries */}
      <div className="mb-3 flex flex-wrap justify-center gap-2">
        {PRESETS.map((q) => (
          <button
            key={q}
            onClick={() => handleSimulate(q)}
            disabled={loading}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask an AI-style question…"
          className="input flex-1 text-base"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSimulate()
          }}
          disabled={loading}
        />
        <button
          onClick={() => handleSimulate()}
          disabled={loading || !query.trim()}
          className="btn-primary px-7 disabled:opacity-60"
        >
          {loading ? 'Analyzing…' : 'Simulate'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-2xl border border-border bg-white/[0.02] p-5 sm:p-6">
          {/* Signal row */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--signal)]">
              {result.intentLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--ready)]/25 bg-[var(--ready)]/10 px-2.5 py-0.5 text-xs text-[var(--ready)]">
              Readiness {result.readiness}%
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              parse confidence {Math.round(result.confidence * 100)}%
            </span>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 border-b border-border">
            {([
              ['natural', 'How an agent answers'],
              ['structured', 'What agents parse'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'border-b-2 border-[#7C3AED] text-white'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'natural' ? (
            <div>
              <p className="leading-relaxed text-zinc-200">{result.naturalLanguage}</p>
              <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-[var(--signal)]">
                Agent actions
              </p>
              <ul className="space-y-1.5">
                {result.agentActions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="select-none text-[var(--ready)]">→</span>
                    <span className="font-mono text-[12px] leading-5 text-zinc-300">{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--signal)]">
                Offers the agent can act on
              </p>
              <div className="space-y-2">
                {result.offers.map((o) => (
                  <div
                    key={o.key}
                    className={`rounded-lg border p-3 ${
                      o.bestMatch
                        ? 'border-[var(--ready)]/40 bg-[var(--ready)]/[0.06]'
                        : 'border-border bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-white">
                        {o.name}
                        {o.bestMatch && (
                          <span className="rounded-full bg-[var(--ready)]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--ready)]">
                            Best match
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-[var(--ready)]">{o.price || 'Custom'}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <span className="truncate text-xs text-muted-foreground">{o.description}</span>
                      <code className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        offer={o.key}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.recommendations.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--amber)]">
                Quick wins to rank higher with agents
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.recommendations.slice(0, 3).map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Conversion hook */}
          <div className="mt-6 flex flex-col items-center gap-3 border-t border-border pt-4 sm:flex-row">
            <a href={appUrl('/create')} className="btn-primary h-10 flex-1 px-5 text-sm sm:flex-none">
              Create a page like this
            </a>
            <a href="/simulator" className="text-sm text-[var(--signal)] hover:underline">
              Open the full simulator →
            </a>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Runs on the same simulator used by the full Agent Simulator.{' '}
        <a href="/simulator" className="underline hover:text-white">
          Open global simulator →
        </a>
      </p>
    </div>
  )
}
