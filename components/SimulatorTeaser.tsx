'use client'

import { useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import { appUrl } from '../lib/site'
import type {
  PublicSimulatorDecisionStatus,
  PublicSimulatorDecisionStep,
  PublicSimulatorMode,
} from '../lib/public-simulator'
import { buildPublicSimulatorRefinement } from '../lib/public-simulator'

type SimOffer = {
  key: string
  type: 'service' | 'product'
  name: string
  price: string | null
  description: string | null
  checkoutUrl: string | null
  bestMatch: boolean
}

type MatchedBusiness = {
  name: string
  slug: string
  url: string
  matchType: 'strong' | 'partial'
  offer: {
    key: string
    name: string
    price: string | null
    checkoutUrl: string | null
  } | null
}

type SimulationScenario = {
  active: true
  source: 'commerce-library'
  label: 'SIMULATION'
  title: string
  serviceType: string
  explanation: string
  disclaimer: string
  detailsToConfirm: string[]
  nextSteps: string[]
}

type UnderstoodRequest = {
  label: string
  marketplaceChecked: true
  commerceLibraryChecked: true
  intentPreserved: true
  coverageStatus: 'growing'
}

type SimResponse = {
  mode: PublicSimulatorMode
  noMatch: boolean
  intent: string
  intentLabel: string
  naturalLanguage: string
  readiness: number
  confidence: number | null
  offers: SimOffer[]
  agentActions: string[]
  matchedBusiness: MatchedBusiness | null
  simulation: SimulationScenario | null
  understoodRequest: UnderstoodRequest | null
  decisionPath: PublicSimulatorDecisionStep[]
  llmEnhanced: boolean
}

const PRESETS = [
  'Find me a cleaning service that can handle a 2x2 move out cleaning for next Wednesday',
  'Find a mobile car detailer for this weekend',
  'I need a private tutor for weekly math lessons',
  'Find an event photographer for a birthday party',
]

const DECISION_STATUS_LABELS: Record<PublicSimulatorDecisionStatus, string> = {
  understood: 'Understood',
  live: 'Live',
  related: 'Related',
  checked: 'Checked',
  reference: 'Reference',
  protected: 'Protected',
  verify: 'Verify',
  actionable: 'Actionable',
}

function decisionStepClass(status: PublicSimulatorDecisionStatus): string {
  if (status === 'live' || status === 'actionable') {
    return 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.05] text-[var(--ready)]'
  }
  if (status === 'related' || status === 'reference' || status === 'verify') {
    return 'border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] text-[var(--amber)]'
  }
  if (status === 'understood' || status === 'protected') {
    return 'border-[var(--signal)]/25 bg-[var(--signal)]/[0.05] text-[var(--signal)]'
  }
  return 'border-border bg-white/[0.025] text-muted-foreground'
}

function trackSimulatorEvent(
  name: string,
  properties: Record<string, string | number | boolean>,
) {
  try {
    track(name, properties)
  } catch {
    // Analytics must never interrupt the public simulator.
  }
}

function DecisionPath({ steps }: { steps: PublicSimulatorDecisionStep[] }) {
  if (!steps.length) return null

  return (
    <div className="mb-5">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Nexez decision path
      </p>
      <ol aria-label="Nexez decision path" className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`rounded-lg border p-3 ${decisionStepClass(step.status)}`}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
              {String(index + 1).padStart(2, '0')} · {DECISION_STATUS_LABELS[step.status]}
            </span>
            <p className="mt-2 text-sm font-medium text-white">{step.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function CoverageGapResult({
  request,
  query,
  naturalLanguage,
  onRefine,
}: {
  request: UnderstoodRequest
  query: string
  naturalLanguage: string
  onRefine: () => void
}) {
  const refinement = buildPublicSimulatorRefinement(query)

  return (
    <div>
      <div
        className="rounded-xl border border-[var(--ready)]/20 px-4 py-5 sm:px-5"
        style={{
          background: 'radial-gradient(100% 140% at 0% 0%, color-mix(in srgb, var(--ready) 10%, transparent), transparent 62%)',
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ready)]">
          Nexez interpreted
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white">
          {request.label}
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300">{naturalLanguage}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-white">{refinement.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {refinement.guidance}
          </p>
        </div>
        <button onClick={onRefine} className="btn-secondary h-9 shrink-0 px-4 text-xs">
          Refine request
        </button>
      </div>
    </div>
  )
}

export function SimulatorTeaser() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SimResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'natural' | 'structured'>('natural')

  const handleSimulate = async (customQuery?: string) => {
    const q = (customQuery || query).trim()
    if (!q) return

    const source = customQuery ? 'preset' : 'typed'
    trackSimulatorEvent('simulator_submit', {
      source,
      query_length: q.length,
    })

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
        understoodRequest: data.understoodRequest || null,
        decisionPath: data.decisionPath || [],
        llmEnhanced: Boolean(data.llmEnhanced),
      })
      trackSimulatorEvent('simulator_result', {
        source,
        mode: data.mode,
        intent: data.intent,
        live_match: Boolean(data.matchedBusiness),
        llm_enhanced: Boolean(data.llmEnhanced),
      })
      setQuery(q)
      setActiveTab('natural')
    } catch (err: any) {
      trackSimulatorEvent('simulator_error', {
        source,
      })
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
          ref={inputRef}
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
            {result.mode === 'partial_match' && result.matchedBusiness && (
              <span className="inline-flex items-center rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--amber)]">
                Related marketplace · {result.matchedBusiness.name}
              </span>
            )}
            {result.mode === 'simulation' && result.simulation && (
              <span className="inline-flex items-center rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--amber)]">
                Simulation · {result.simulation.title}
              </span>
            )}
            {result.mode === 'coverage_gap' && result.understoodRequest && (
              <span className="inline-flex items-center rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--ready)]">
                Request understood
              </span>
            )}
            {result.mode === 'coverage_gap' ? (
              <span className="ml-auto text-[11px] text-muted-foreground">coverage expanding</span>
            ) : result.mode === 'simulation' ? (
              <span className="ml-auto text-[11px] text-muted-foreground">reference match only</span>
            ) : result.mode === 'partial_match' ? (
              <span className="ml-auto text-[11px] text-muted-foreground">partial match</span>
            ) : result.confidence !== null ? (
              <span className="ml-auto text-[11px] text-muted-foreground">
                match confidence {Math.round(result.confidence * 100)}%
              </span>
            ) : null}
          </div>

          <DecisionPath steps={result.decisionPath} />

          {result.simulation && (
            <div className="mb-4 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] px-3 py-2 text-xs leading-relaxed text-zinc-300">
              <span className="font-medium text-[var(--amber)]">Simulation only.</span>{' '}
              {result.simulation.disclaimer}
            </div>
          )}

          {result.mode === 'coverage_gap' && result.understoodRequest ? (
            <CoverageGapResult
              request={result.understoodRequest}
              query={query}
              naturalLanguage={result.naturalLanguage}
              onRefine={() => {
                trackSimulatorEvent('simulator_refine', { mode: result.mode })
                inputRef.current?.focus()
                inputRef.current?.select()
              }}
            />
          ) : (
            <>
              {/* Tabs */}
              <div className="mb-4 flex gap-1 border-b border-border">
                {([
                  ['natural', 'How an agent answers'],
                  ['structured', result.simulation ? 'Details to confirm' : 'What agents parse'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveTab(id)
                      trackSimulatorEvent('simulator_detail_view', {
                        mode: result.mode,
                        tab: id,
                      })
                    }}
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
                    Buyer details needed for a real match
                  </p>
                  <div className="rounded-lg border border-border bg-white/[0.02] p-3">
                    <p className="text-sm font-medium text-white">{result.simulation.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      This request is closest to {result.simulation.serviceType}. A real provider would need the following details before Nexez could verify fit, price, or availability.
                    </p>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {result.simulation.detailsToConfirm.map((detail) => (
                        <li key={detail} className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--ready)]" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--signal)]">
                    {result.mode === 'partial_match' ? 'Related offers to verify' : 'Offers the agent can act on'}
                  </p>
                  <div className="space-y-2">
                    {result.offers.length > 0 ? result.offers.map((o) => (
                      <div
                        key={o.key}
                        className={`rounded-lg border p-3 ${
                          result.mode === 'partial_match'
                            ? 'border-[var(--amber)]/30 bg-[var(--amber)]/[0.05]'
                            : o.bestMatch
                            ? 'border-[var(--ready)]/40 bg-[var(--ready)]/[0.06]'
                            : 'border-border bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-sm font-medium text-white">
                            {o.name}
                            {(o.bestMatch || result.mode === 'partial_match') && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                                result.mode === 'partial_match'
                                  ? 'bg-[var(--amber)]/15 text-[var(--amber)]'
                                  : 'bg-[var(--ready)]/15 text-[var(--ready)]'
                              }`}>
                                {result.mode === 'partial_match' ? 'Related offer' : 'Best match'}
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
            </>
          )}

          {/* Conversion hook */}
          <div className="mt-6 flex flex-col items-center gap-3 border-t border-border pt-4 sm:flex-row">
            <a
              href={appUrl('/create')}
              onClick={() => trackSimulatorEvent('simulator_cta', {
                mode: result.mode,
                cta: result.mode === 'coverage_gap' ? 'list_service' : 'create_listing',
              })}
              className="btn-primary h-10 flex-1 px-5 text-sm sm:flex-none"
            >
              {result.mode === 'coverage_gap' ? 'List this service' : 'Create an agent-ready listing'}
            </a>
            <a
              href={result.mode === 'coverage_gap' ? '/discovery' : '/simulator'}
              onClick={() => trackSimulatorEvent('simulator_cta', {
                mode: result.mode,
                cta: result.mode === 'coverage_gap' ? 'explore_marketplace' : 'open_full_simulator',
              })}
              className="text-sm text-[var(--signal)] hover:underline"
            >
              {result.mode === 'coverage_gap' ? 'Explore live marketplace →' : 'Open the full simulator →'}
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
