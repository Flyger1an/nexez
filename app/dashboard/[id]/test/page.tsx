'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink,
  Lightbulb,
  Loader2,
  Play,
} from 'lucide-react'
import { ErrorBoundary } from '../../../../components/ErrorBoundary'
import { SurfaceHeader, surfaceActionClass } from '../../../../components/dashboard/SurfacePrimitives'
import { StatusPill } from '../../../../components/settings/SettingsPrimitives'
import {
  AgentPage,
  OWNER_PAGE_SELECT,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getOfferCount,
  getReadinessScore,
} from '../../../../lib/agent-page'
import {
  DEFAULT_AGENT_QUERY,
  buildDefaultAgentQuery,
  buildParsedSchema,
  getRecommendations,
} from '../../../../lib/agent-simulator'
import { createClient } from '../../../../utils/supabase/client'
import { agentRuntimeUrl } from '../../../../lib/site'
import type { AgentLabRun } from '../../../../lib/agent-lab-run'

type PageProps = {
  params: Promise<{ id: string }>
}

const agentTabs = ['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Generic Agent', 'LLM-Enhanced']
const responseTabs = ['Parsed Schema', 'Natural Language', 'Suggested Actions']

export default function AgentSimulatorPage({ params }: PageProps) {
  const router = useRouter()
  const [id, setId] = useState('')
  const [page, setPage] = useState<AgentPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [agent, setAgent] = useState(agentTabs[0])
  const [responseTab, setResponseTab] = useState(responseTabs[0])
  const [query, setQuery] = useState(DEFAULT_AGENT_QUERY)
  const [message, setMessage] = useState('')
  const [runError, setRunError] = useState('')
  const [simulationRun, setSimulationRun] = useState<AgentLabRun | null>(null)
  const [baseUrl, setBaseUrl] = useState(getBaseUrl())

  // Phase 4: Embed preview simulation state
  const [simulatePreferOriginal, setSimulatePreferOriginal] = useState(false)

  useEffect(() => {
    params.then(({ id }) => setId(id))
  }, [params])

  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  const readiness = page ? getReadinessScore(page) : 0
  const fallbackRecommendations = useMemo(() => (page ? getRecommendations(page) : []), [page])
  const previewSchema = useMemo(() => (page ? buildParsedSchema(page, query, agent, baseUrl) : null), [page, query, agent, baseUrl])
  const availableAgentTabs = agentTabs.filter(
    (tab) => tab !== 'LLM-Enhanced' || simulationRun?.result.results.some((result) => result.agent === tab),
  )
  const activeResult = simulationRun?.result.results.find((result) => result.agent === agent) as any
  const schema = activeResult?.schema ?? previewSchema
  const recommendations = simulationRun?.result.recommendations ?? fallbackRecommendations

  async function loadPage(pageId: string) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace(`/login?next=/dashboard/${pageId}/test`)
      return
    }

    const { data, error } = await supabase
      .from('pages')
      .select(OWNER_PAGE_SELECT)
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .single<AgentPage>()

    if (error || !data) {
      setMessage('Listing not found, or you do not have access to test it.')
      setLoading(false)
      return
    }

    setPage(data)
    setQuery(buildDefaultAgentQuery(data))
    setLoading(false)
  }

  useEffect(() => {
    if (!id) return
    loadPage(id)
  }, [id])

  async function runSimulation() {
    if (!page || !query.trim()) return
    setRunning(true)
    setMessage('')
    setRunError('')

    try {
      const response = await fetch('/api/simulator/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageId: page.id,
          query: query.trim(),
          includeLlm: true,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { run?: AgentLabRun; error?: string; persistenceError?: string }
      if (!response.ok || !payload.run) throw new Error(payload.error || 'Analysis could not be completed.')

      setSimulationRun(payload.run)
      const nextAgent = payload.run.evidence.execution.llm.executed
        ? 'LLM-Enhanced'
        : payload.run.result.results.some((result) => result.agent === agent)
          ? agent
          : payload.run.result.results[0]?.agent ?? agentTabs[0]
      setAgent(nextAgent)
      setMessage(
        payload.persistenceError
          ? payload.persistenceError
          : payload.run.persisted
            ? 'Analysis complete and saved to Agent Lab history.'
            : 'Analysis complete.',
      )
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Analysis could not be completed.')
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        Loading simulator...
      </main>
    )
  }

  if (!page || !previewSchema) {
    return (
      <main className="min-h-screen bg-[#090b10] px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
            {message || 'Listing not found.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]" data-testid="listing-agent-simulator">
      <ErrorBoundary>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <SurfaceHeader
          eyebrow="Listing simulator"
          icon={Play}
          title={page.name}
          description="See exactly how each agent reads this listing, what it notices, where it hesitates, and which action it would take next."
          actions={(
            <>
              <a href={`/dashboard/${page.id}`} className={surfaceActionClass}>Edit Listing</a>
              {page.is_published ? (
                <a href={agentRuntimeUrl(`/${page.slug}`)} target="_blank" rel="noreferrer" className={surfaceActionClass}>
                  Public Listing <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              <a href="/simulator" className={surfaceActionClass}>Agent Lab</a>
            </>
          )}
          footer={(
            <>
              <StatusPill label={page.is_published ? 'Published listing' : 'Owner draft'} tone={page.is_published ? 'ready' : 'attention'} />
              <StatusPill label={`${readiness}% readiness`} tone={readiness >= 80 ? 'ready' : readiness >= 60 ? 'attention' : 'neutral'} />
              <StatusPill label={`${getOfferCount(page)} offers`} />
              <StatusPill label={simulationRun ? `${simulationRun.result.results.length} agent views` : 'Ready to analyze'} />
            </>
          )}
        />

        {/* Agent Tabs - per Design System */}
        <div role="tablist" aria-label="Simulated agents" className="platform-tablist mb-6 mt-6">
          {availableAgentTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={agent === tab}
              onClick={() => setAgent(tab)}
              className="platform-tab"
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Side-by-Side Comparison - Design System Spec */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT: Original Page Preview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Original Listing</p>
                <h3 className="text-xl font-semibold tracking-tight">What agents will see</h3>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold text-[var(--ready)]">{readiness}</div>
                <div className="text-xs text-[#9CA3AF] -mt-1">READINESS</div>
              </div>
            </div>

            <div className="card !p-5">
              <h2 className="text-2xl font-semibold tracking-tight">{page?.name}</h2>
              <p className="mt-2 text-[#9CA3AF] leading-relaxed">{page?.description}</p>

              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white/5 px-3 py-1 border border-white/10">{getOfferCount(page || {})} offers</span>
                <span className="rounded-full bg-white/5 px-3 py-1 border border-white/10">{page?.location || 'Remote'}</span>
              </div>
            </div>

            {/* Query + Run */}
            <div className="mt-6">
              <label htmlFor="listing-simulator-query" className="mb-2 block text-sm text-[var(--fg-muted)]">Simulate this query from an agent</label>
              <input
                id="listing-simulator-query"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSimulationRun(null)
                  setMessage('')
                  setRunError('')
                }}
                className="input"
                placeholder="What would an agent ask?"
                maxLength={500}
              />
              <button
                type="button"
                onClick={runSimulation}
                disabled={running || !query.trim()}
                className="btn-primary w-full mt-3"
              >
                {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {running ? 'Analyzing with ' + agent + '...' : 'Run Analysis'}
              </button>
            </div>
          </div>

          {/* RIGHT: Agent's Parsed Understanding */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Agent Understanding</p>
                <h3 className="text-xl font-semibold tracking-tight">{agent}'s view</h3>
              </div>
              <button
                type="button"
                onClick={runSimulation}
                disabled={running || !query.trim()}
                className="btn-ghost text-sm flex items-center gap-2"
              >
                <Lightbulb className="size-4" /> Regenerate
              </button>
            </div>

            {/* Response Tabs */}
            <div role="tablist" aria-label="Agent response views" className="platform-tablist mb-4">
              {responseTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={responseTab === tab}
                  aria-controls="listing-simulator-response"
                  onClick={() => setResponseTab(tab)}
                  className="platform-tab"
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Simulated Agent Output */}
            <div id="listing-simulator-response" role="tabpanel" className="min-h-[320px] card !p-5 text-sm">
              {responseTab === 'Parsed Schema' && schema && (
                <pre className="font-mono text-xs text-[var(--signal)] whitespace-pre-wrap">{JSON.stringify(schema, null, 2)}</pre>
              )}
              {responseTab === 'Natural Language' && activeResult?.naturalLanguage ? (
                <p className="whitespace-pre-wrap leading-7 text-[var(--fg-soft)]">{activeResult.naturalLanguage}</p>
              ) : null}
              {responseTab === 'Natural Language' && !activeResult?.naturalLanguage && activeResult?.verdict ? (
                <div className="space-y-5 text-[var(--fg-muted)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      label={activeResult.verdict.stance === 'recommend' ? 'Would recommend' : activeResult.verdict.stance === 'skip' ? 'Would skip' : 'Needs information'}
                      tone={activeResult.verdict.stance === 'recommend' ? 'ready' : activeResult.verdict.stance === 'skip' ? 'danger' : 'attention'}
                    />
                    <span className="text-xs">{activeResult.verdict.lens}</span>
                  </div>
                  <p className="text-lg font-medium leading-7 text-[var(--fg)]">{activeResult.verdict.headline}</p>
                  {activeResult.verdict.noticed?.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--fg-muted)]">What it noticed</p>
                      <ul className="mt-2 space-y-2">{activeResult.verdict.noticed.map((item: string) => <li key={item}>+ {item}</li>)}</ul>
                    </div>
                  ) : null}
                  {activeResult.verdict.gaps?.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--fg-muted)]">What held it back</p>
                      <ul className="mt-2 space-y-2">{activeResult.verdict.gaps.map((item: string) => <li key={item}>− {item}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {responseTab === 'Natural Language' && !activeResult ? (
                <div className="flex min-h-56 items-center justify-center text-center text-[var(--fg-muted)]">
                  Run the analysis to see this agent&apos;s query-specific verdict.
                </div>
              ) : null}
              {responseTab === 'Suggested Actions' && (
                <div>
                  <div className="text-[var(--ready)] font-medium mb-3">High-confidence next steps</div>
                  <ul className="space-y-2 text-sm">
                    {([
                      ...(Array.isArray(activeResult?.schema?.suggestedActions) ? activeResult.schema.suggestedActions : schema?.suggestedActions ?? []),
                      ...(activeResult?.recommendations ?? []),
                    ] as string[]).filter((item, index, items) => item && items.indexOf(item) === index).map((item) => (
                      <li key={item} className="flex gap-2">→ {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {simulationRun ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--fg-muted)]" role="status" aria-live="polite">
                <span>{new Date(simulationRun.createdAt).toLocaleString()}</span>
                <span>{simulationRun.executionMode === 'deterministic_with_llm' ? 'Multi-agent + AI assist' : 'Deterministic multi-agent'}</span>
                <span>{simulationRun.persisted ? 'Saved to history' : 'Not saved'}</span>
              </div>
            ) : null}
            {message ? <p className="mt-3 text-sm text-[var(--ready)]" role="status">{message}</p> : null}
            {runError ? <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{runError}</p> : null}
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-8 card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Lightbulb className="size-4 text-[var(--amber)]" />
            Recommendations to improve agent performance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm text-[#9CA3AF]">
            {recommendations.length ? (
              recommendations.map((rec, i) => <div key={i}>• {rec}</div>)
            ) : (
              <div className="text-[var(--ready)]">This listing is already well-optimized for agents.</div>
            )}
          </div>
        </div>

        {/* Phase 4: Embed Preview + Original Site Simulation (enhanced) */}
        <div className="mt-8 card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Embed & Linking Test</p>
              <h3 className="text-xl font-semibold tracking-tight">Embed Preview + Prefer Original Simulation</h3>
            </div>
            <div className="flex gap-2">
              {page.is_published ? (
                <button
                  type="button"
                  onClick={() => window.open(`/${page.slug}`, '_blank')}
                  className="inline-flex items-center gap-1 rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/5"
                >
                  Open in new tab <ExternalLink className="size-3" />
                </button>
              ) : null}
              <a href={`/dashboard/${id}/settings`} className="text-xs text-[var(--signal)] hover:underline">Configure per-offer prefs →</a>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={simulatePreferOriginal}
                onChange={(e) => setSimulatePreferOriginal(e.target.checked)}
                className="accent-[var(--signal)]"
              />
              Simulate "Prefer original site" (listing-level)
            </label>
            <span className="text-[10px] text-zinc-500">When on, primary CTAs would link to original site (per-offer toggles override in real listings)</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--bg)]">
            {page.is_published ? (
              <iframe
                src={`/${page.slug}`}
                className="h-[520px] w-full"
                title="Live embed preview"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div data-testid="draft-embed-preview" className="flex min-h-72 items-center justify-center p-6 text-center sm:p-10">
                <div className="max-w-xl">
                  <StatusPill label="Private draft" tone="attention" className="mx-auto" />
                  <h4 className="mt-4 text-2xl font-semibold tracking-tight">Publish to activate the live embed</h4>
                  <p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">
                    The agent analysis above uses your owner-visible draft safely. The public page and embed remain unavailable until you publish this listing.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-[10px] text-zinc-400 md:grid-cols-2">
            <div>
              • Iframe is responsive by default (width 100%).
              <br />• Per-offer "Book on original site" from builder takes precedence over listing-level toggle.
            </div>
            <div>
              • Real embeds inherit the listing's <code>prefer_original_site</code> + individual offer flags.
              <br />• Test with agents using the simulator above.
            </div>
          </div>

          <p className="mt-2 text-[10px] text-[var(--ready)]/80">
            {simulatePreferOriginal
              ? "Simulation active: In a real embed, booking CTAs would route to the original website for offers without per-offer override."
              : "Default behavior: Nexez checkout is preferred unless per-offer or listing-level original preference is set."}
          </p>

          {/* Interactive simulation panel: shows exactly what the effective targets would be under the toggle */}
          <div className="mt-4 rounded border border-white/10 bg-black/30 p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-2">Effective booking targets (under current simulation)</div>
            <div className="space-y-1 text-xs">
              {getCheckoutOffers(page).length > 0 ? (
                getCheckoutOffers(page).map((offer, flatIdx) => {
                  const perOfferPrefer = !!offer.prefer_original_for_this
                  const pagePreferSim = simulatePreferOriginal
                  const useOriginal = perOfferPrefer || (pagePreferSim && !!offer.url)
                  // offer is enriched by getCheckoutOffers with .kind and .index (per-kind)
                  const kind = (offer as any).kind as 'services' | 'products'
                  const oIndex = (offer as any).index as number
                  const effective = useOriginal && offer.url
                    ? offer.url
                    : `${baseUrl}/checkout/${page.slug}?offer=${getCheckoutOfferKey(kind, oIndex)}`
                  return (
                    <div key={flatIdx} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1">
                      <span className="truncate text-zinc-200">{offer.name}</span>
                      <span className={`font-mono text-[10px] ${useOriginal ? 'text-[var(--amber)]' : 'text-[var(--signal)]'}`}>
                        {useOriginal ? '→ original site' : '→ Nexez checkout'} {effective.length > 48 ? '…' + effective.slice(-40) : effective}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="text-zinc-500">Add offers in the editor to see simulated targets.</div>
              )}
            </div>
            <div className="mt-2 text-[9px] text-zinc-500">Offer-level routing choices override the listing-level simulation setting above.</div>
          </div>
        </div>
      </div>
      </ErrorBoundary>
    </main>
  )
}
