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

type MatchedBusiness = {
  name: string
  slug: string
  url: string
  score: number
  matchReasons: string[]
  offer: {
    key: string
    name: string
    price: string | null
    checkoutUrl: string
  } | null
}

type SimulationScenario = {
  active: true
  source: 'commerce-library'
  label: string
  disclaimer: string
  candidate: {
    id: string
    title: string
    domain: string
    archetype: string
    status: string
    teaches: string
    capabilityTags: string[]
    gapSignals: string[]
    matchedTerms: string[]
    matchScore: number
  }
}

type SimResponse = {
  mode: 'marketplace' | 'simulation' | 'no_match'
  noMatch: boolean
  intent: string
  intentLabel: string
  naturalLanguage: string
  readiness: number
  confidence: number
  offers: SimOffer[]
  agentActions: string[]
  matchedBusiness: MatchedBusiness | null
  simulation: SimulationScenario | null
}

const PRESETS = [
  'Find me a cleaning service that can handle a 2x2 move out cleaning for next Wednesday',
  'Find a mobile car detailer for this weekend',
  'I need a private tutor for weekly math lessons',
  'Find an event photographer for a birthday party',
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
        mode: data.mode,
        noMatch: Boolean(data.noMatch),
        intent: data.intent,
        intentLabel: data.intentLabel,
        naturalLanguage: data.naturalLanguage,
        readiness: data.readiness,
        confidence: data.confidence,
        offers: data.offers || [],
        agentActions: data.agentActions || [],
        matchedBusiness: data.matchedBusiness || null,
        simulation: data.simulation || null,
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
      {/* Preset buyer queries */}
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
          placeholder="Ask Nexez to find a service…"
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
          {loading ? 'Searching…' : 'Simulate'}
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
            <span className="inline-flex items-center rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--signal)]">
              {result.intentLabel}
            </span>
            {result.mode === 'marketplace' && result.matchedBusiness && (
              <span className="inline-flex items-center rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--ready)]">
                Live marketplace · {result.matchedBusiness.name}
              </span>
            )}
            {result.mode === 'simulation' && result.simulation && (
              <span className="inline-flex items-center rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--amber)]">
                Simulation · {result.simulation.candidate.title}
              </span>
            )}
            {result.mode === 'simulation' ? (
              <span className="ml-auto text-[11px] text-muted-foreground">reference match only</span>
            ) : (
              <span className="ml-auto text-[11px] text-muted-foreground">
                match confidence {Math.round(result.confidence * 100)}%
              </span>
            )}
          </div>

          {result.simulation && (
            <div className="mb-4 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] px-3 py-2 text-xs leading-relaxed text-zinc-300">
              <span className="font-medium text-[var(--amber)]">Simulation only.</span>{' '}
              {result.simulation.disclaimer}
            </div>
          )}

          {/* Tabs */}
          <div className="mb-4 flex gap-1 border-b border-border">
            {([
              ['natural', 'How an agent answers'],
              ['structured', result.simulation ? 'Reference scenario' : 'What agents parse'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'border-b-2 border-[var(--signal)] text-white'
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
          ) : result.simulation ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--amber)]">
                Commerce Library reference — not inventory
              </p>
              <div className="rounded-lg border border-border bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">{result.simulation.candidate.title}</span>
                  <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {result.simulation.candidate.id}
                  </code>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {result.simulation.candidate.teaches}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.simulation.candidate.capabilityTags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--signal)]">
                Offers the agent can act on
              </p>
              <div className="space-y-2">
                {result.offers.length > 0 ? result.offers.map((o) => (
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
                )) : (
                  <div className="rounded-lg border border-border bg-white/[0.02] p-3 text-sm text-muted-foreground">
                    No actionable live offer was found for this request.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conversion hook */}
          <div className="mt-6 flex flex-col items-center gap-3 border-t border-border pt-4 sm:flex-row">
            <a href={appUrl('/create')} className="btn-primary h-10 flex-1 px-5 text-sm sm:flex-none">
              Create an agent-ready listing
            </a>
            <a href="/simulator" className="text-sm text-[var(--signal)] hover:underline">
              Open the full simulator →
            </a>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Want to grade a live page? Paste any URL in the full simulator to see how it ranks for a query.{' '}
        <a href="/simulator" className="underline hover:text-white">
          Open global simulator →
        </a>
      </p>
    </div>
  )
}
