'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  Code2,
  ExternalLink,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Play,
  Wrench,
} from 'lucide-react'
import { ErrorBoundary } from '../../../../components/ErrorBoundary'
import {
  AgentPage,
  OWNER_PAGE_SELECT,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getOfferCount,
  getReadinessScore,
} from '../../../../lib/agent-page'
import { buildParsedSchema, getRecommendations } from '../../../../lib/agent-simulator'
import { createClient } from '../../../../utils/supabase/client'

type PageProps = {
  params: Promise<{ id: string }>
}

const agentTabs = ['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Generic Agent']
const responseTabs = ['Parsed Schema', 'Natural Language', 'Suggested Actions']

type SimulationResult = {
  ok?: boolean
  provider?: string
  checkoutUrl?: string
  actionUrl?: string | null
  stripeConfigured?: boolean
  events?: Record<string, boolean>
  error?: string
}

export default function AgentSimulatorPage({ params }: PageProps) {
  const [id, setId] = useState('')
  const [page, setPage] = useState<AgentPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [agent, setAgent] = useState(agentTabs[0])
  const [responseTab, setResponseTab] = useState(responseTabs[0])
  const [query, setQuery] = useState('Book a strategy session next week')
  const [message, setMessage] = useState('')
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)

  // Phase 4: Embed preview simulation state
  const [simulatePreferOriginal, setSimulatePreferOriginal] = useState(false)

  useEffect(() => {
    params.then(({ id }) => setId(id))
  }, [params])

  const readiness = page ? getReadinessScore(page) : 0
  const recommendations = useMemo(() => (page ? getRecommendations(page) : []), [page])
  const schema = useMemo(() => (page ? buildParsedSchema(page, query, agent) : null), [page, query, agent])

  async function loadPage(pageId: string) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = `/login?next=/dashboard/${pageId}/test`
      return
    }

    const { data, error } = await supabase
      .from('pages')
      .select(OWNER_PAGE_SELECT)
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .single<AgentPage>()

    if (error || !data) {
      setMessage('Page not found, or you do not have access to test it.')
      setLoading(false)
      return
    }

    setPage(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!id) return
    loadPage(id)
  }, [id])

  async function runSimulation() {
    setRunning(true)
    setMessage('')
    setSimulationResult(null)

    try {
      const offer = page ? getCheckoutOffers(page)[0] : null

      if (!page || !offer) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        setSimulationResult({ ok: false, error: 'Add at least one offer before testing checkout handoff.' })
        return
      }

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          slug: page.slug,
          offer: getCheckoutOfferKey(offer.kind, offer.index),
          query,
          dryRun: true,
        }),
      })
      const result = (await response.json().catch(() => ({}))) as SimulationResult

      setSimulationResult({
        ...result,
        ok: response.ok && result.ok !== false,
      })
    } catch (error) {
      setSimulationResult({
        ok: false,
        error: error instanceof Error ? error.message : 'Simulation failed.',
      })
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

  if (!page || !schema) {
    return (
      <main className="min-h-screen bg-[#090b10] px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
            {message || 'Page not found.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <ErrorBoundary>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-3">
            <a href={`/dashboard/${page.id}`} className={topButtonClass}>
              <Wrench className="size-4" />
              Edit Page
            </a>
            <a href={`/${page.slug}`} className={topButtonClass}>
              <ExternalLink className="size-4" />
              Public Page
            </a>
          </div>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-[#9CA3AF]">Agent Simulator</p>
            <h1 className="text-4xl font-semibold tracking-tighter">See exactly how AI agents parse your page</h1>
          </div>
          <div className="flex gap-3">
            <a href={`/dashboard/${page?.id}`} className="btn-secondary">Edit Page</a>
            <a href={`/${page?.slug}`} className="btn-secondary">View Live</a>
            <a href="/simulator" className="btn-secondary">Global /simulator</a>
          </div>
        </div>

        {/* Agent Tabs — per Design System */}
        <div className="flex border-b border-white/10 mb-6">
          {agentTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setAgent(tab)}
              className={`agent-tab px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                agent === tab 
                  ? 'border-[#7C3AED] text-white bg-[#1A1625]' 
                  : 'border-transparent text-[#9CA3AF] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Side-by-Side Comparison — Design System Spec */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT: Original Page Preview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Original Page</p>
                <h3 className="text-xl font-semibold tracking-tight">What agents will see</h3>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold text-[#10B981]">{readiness}</div>
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
              <label className="text-sm text-[#9CA3AF] mb-2 block">Simulate this query from an agent</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input"
                placeholder="What would an agent ask?"
              />
              <button
                onClick={runSimulation}
                disabled={running}
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
                onClick={runSimulation}
                disabled={running}
                className="btn-ghost text-sm flex items-center gap-2"
              >
                <Lightbulb className="size-4" /> Regenerate
              </button>
            </div>

            {/* Response Tabs */}
            <div className="flex gap-1 mb-4 border-b border-white/10">
              {responseTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setResponseTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition ${
                    responseTab === tab 
                      ? 'text-white border-b-2 border-[#7C3AED]' 
                      : 'text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Simulated Agent Output */}
            <div className="min-h-[320px] card !p-5 text-sm">
              {responseTab === 'Parsed Schema' && schema && (
                <pre className="font-mono text-xs text-[#C4B5FD] whitespace-pre-wrap">{JSON.stringify(schema, null, 2)}</pre>
              )}
              {responseTab === 'Natural Language' && (
                <div className="space-y-4 text-[#9CA3AF]">
                  <p>{agent} understands this as a {page?.name} offering focused on {page?.audience || 'qualified buyers'}.</p>
                  <p>It sees {getOfferCount(page || {})} clear offers with pricing and direct actions.</p>
                  <p className="text-white">Recommended action: Proceed to checkout for the highest-value offer.</p>
                </div>
              )}
              {responseTab === 'Suggested Actions' && (
                <div>
                  <div className="text-[#10B981] font-medium mb-3">High-confidence next steps</div>
                  <ul className="space-y-2 text-sm">
                    <li className="flex gap-2">→ Use the "Agent checkout" button on the top offer</li>
                    <li className="flex gap-2">→ Ask for clarification on timeline and budget</li>
                    <li className="flex gap-2">→ Route to the main website if more context needed</li>
                  </ul>
                </div>
              )}
            </div>

            {simulationResult && (
              <div className="mt-4 text-xs text-[#9CA3AF]">
                Checkout simulation: {formatProvider(simulationResult.provider)}
              </div>
            )}
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-8 card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Lightbulb className="size-4 text-[#F59E0B]" />
            Recommendations to improve agent performance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm text-[#9CA3AF]">
            {recommendations.length ? (
              recommendations.map((rec, i) => <div key={i}>• {rec}</div>)
            ) : (
              <div className="text-[#10B981]">This page is already well-optimized for agents.</div>
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
              <button
                onClick={() => window.open(`/${page.slug}`, '_blank')}
                className="inline-flex items-center gap-1 rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/5"
              >
                Open in new tab <ExternalLink className="size-3" />
              </button>
              <a href={`/dashboard/${id}/settings`} className="text-xs text-[#00F5FF] hover:underline">Configure per-offer prefs →</a>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={simulatePreferOriginal}
                onChange={(e) => setSimulatePreferOriginal(e.target.checked)}
                className="accent-[#7C3AED]"
              />
              Simulate "Prefer original site" (page-level)
            </label>
            <span className="text-[10px] text-zinc-500">When on, primary CTAs would link to original site (per-offer toggles override in real pages)</span>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden bg-[#0A0A0F]">
            <iframe
              src={`/${page.slug}`}
              className="w-full h-[520px]"
              title="Live embed preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-[10px] text-zinc-400 md:grid-cols-2">
            <div>
              • Iframe is responsive by default (width 100%).
              <br />• Per-offer "Book on original site" from builder takes precedence over page-level toggle.
            </div>
            <div>
              • Real embeds inherit the page's <code>prefer_original_site</code> + individual offer flags.
              <br />• Test with agents using the simulator above.
            </div>
          </div>

          <p className="mt-2 text-[10px] text-emerald-300/80">
            {simulatePreferOriginal
              ? "Simulation active: In a real embed, booking CTAs would route to the original website for offers without per-offer override."
              : "Default behavior: Nexez checkout is preferred unless per-offer or page-level original preference is set."}
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
                    : `${getBaseUrl()}/checkout/${page.slug}?offer=${getCheckoutOfferKey(kind, oIndex)}`
                  return (
                    <div key={flatIdx} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1">
                      <span className="truncate text-zinc-200">{offer.name}</span>
                      <span className={`font-mono text-[10px] ${useOriginal ? 'text-amber-300' : 'text-cyan-300'}`}>
                        {useOriginal ? '→ original site' : '→ Nexez checkout'} {effective.length > 48 ? '…' + effective.slice(-40) : effective}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="text-zinc-500">Add offers in the editor to see simulated targets.</div>
              )}
            </div>
            <div className="mt-2 text-[9px] text-zinc-500">Per-offer toggles (set in VisualOfferBuilder) always win. This panel uses the page-level simulation checkbox above for demo purposes.</div>
          </div>
        </div>
      </div>
      </ErrorBoundary>
    </main>
  )
}

// buildParsedSchema and getRecommendations now imported from lib/agent-simulator.ts for reuse (global /simulator + history)

function getSimulationActions(result: SimulationResult | null) {
  if (!result) return []

  if (result.ok) {
    return [
      'Dry-run checkout intent logged',
      result.actionUrl ? 'Use provider URL for final handoff' : 'Use Nexez checkout URL for final handoff',
    ]
  }

  return ['Fix checkout handoff before sending high-intent agents']
}

function formatProvider(provider?: string) {
  switch (provider) {
    case 'stripe_ready':
      return 'Stripe checkout is ready'
    case 'provider_ready':
      return 'Provider redirect is ready'
    case 'needs_stripe_key':
      return 'Stripe price detected, but the secret key is not configured'
    case 'needs_checkout_url':
      return 'Offer needs a checkout URL or Stripe-ready price'
    default:
      return 'Checkout path responded'
  }
}

const topButtonClass =
  'inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10'
