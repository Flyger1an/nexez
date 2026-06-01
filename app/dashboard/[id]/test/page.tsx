'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
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
import {
  AgentPage,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getOfferCount,
  getReadinessScore,
} from '../../../../lib/agent-page'
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

  useEffect(() => {
    params.then(({ id }) => setId(id))
  }, [params])

  useEffect(() => {
    if (!id) return
    loadPage(id)
  }, [id])

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
      .select('*')
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
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <p className="mt-10 rounded-lg border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
            {message || 'Page not found.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
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

            <div className="rounded-2xl border border-white/10 bg-[#12101B] p-5">
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
            <div className="min-h-[320px] rounded-2xl bg-[#12101B] border border-white/10 p-5 text-sm">
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
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm text-[#9CA3AF]">
            {recommendations.length ? (
              recommendations.map((rec, i) => <div key={i}>• {rec}</div>)
            ) : (
              <div className="text-[#10B981]">This page is already well-optimized for agents.</div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function buildParsedSchema(page: AgentPage, query: string, agent: string) {
  const offers = getCheckoutOffers(page).map((offer) => ({
    key: getCheckoutOfferKey(offer.kind, offer.index),
    type: offer.kind === 'services' ? 'service' : 'product',
    name: offer.name,
    price: offer.price || null,
    description: offer.description || null,
    url: offer.url || page.cta_url || page.website_url,
    checkoutUrl: `${getBaseUrl()}/checkout/${page.slug}?offer=${getCheckoutOfferKey(offer.kind, offer.index)}`,
    action: {
      method: 'POST',
      endpoint: `${getBaseUrl()}/api/checkout`,
      body: {
        slug: page.slug,
        offer: getCheckoutOfferKey(offer.kind, offer.index),
      },
    },
  }))

  return {
    agent,
    query,
    schemaVersion: 'nexez.agent-page.v1',
    page: {
      name: page.name,
      slug: page.slug,
      url: `${getBaseUrl()}/${page.slug}`,
      agentJsonUrl: `${getBaseUrl()}/${page.slug}/agent.json`,
      summary: page.description,
      audience: page.audience,
      location: page.location,
      contactEmail: page.contact_email,
      offers,
      faqs: page.faqs ?? [],
    },
    suggestedActions: [
      page.cta_url || page.website_url ? `Open ${page.cta_label || 'primary action'}` : 'Ask business for booking URL',
      page.contact_email ? 'Send buyer context to contact email' : 'Ask for contact email',
      'Summarize offer for buyer',
    ],
  }
}

function getRecommendations(page: AgentPage) {
  const recommendations: string[] = []

  if (!page.description) recommendations.push('Add a natural-language summary for agents.')
  if (!page.cta_url && !page.website_url) recommendations.push('Add a direct booking, purchase, or website URL.')
  if (!getOfferCount(page)) recommendations.push('Add at least one product or service.')
  if (!page.audience) recommendations.push('Describe the best-fit buyer.')
  if (!page.faqs?.length) recommendations.push('Add FAQs so agents can answer buyer objections.')
  if (!page.location && !page.contact_email) recommendations.push('Add service area or contact email.')
  if (getOfferCount(page) > 0 && !page.faqs?.length) recommendations.push('Add 2-3 FAQs — agents love being able to answer "Can I book this directly?"')
  if (page.services?.some((s) => !s.url && !page.cta_url)) recommendations.push('Attach per-offer URLs or a global CTA URL so agents have a concrete next action.')

  return recommendations
}

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
