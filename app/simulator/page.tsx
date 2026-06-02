'use client'

import React, { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  History,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import {
  AgentPage,
  getBaseUrl,
  getOfferCount,
  getReadinessScore,
} from '../../lib/agent-page'
import {
  buildParsedSchema,
  getRecommendations,
  runMultiAgentSimulation,
} from '../../lib/agent-simulator'
import { createClient } from '../../utils/supabase/client'

const agentTabs = ['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Generic Agent']

export default function GlobalAgentSimulator() {
  const [loading, setLoading] = useState(false)
  const [myPages, setMyPages] = useState<AgentPage[]>([])
  const [selectedPage, setSelectedPage] = useState<AgentPage | null>(null)
  const [pasteSlug, setPasteSlug] = useState('')
  const [query, setQuery] = useState('Book a strategy session next week')
  const [currentAgent, setCurrentAgent] = useState(agentTabs[0])
  const [simulationResults, setSimulationResults] = useState<any[]>([])
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadMyPages()
  }, [])

  async function loadMyPages() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsLoggedIn(false)
        return
      }
      setIsLoggedIn(true)

      const { data } = await supabase
        .from('pages')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        setMyPages(data as AgentPage[])
      }
    } catch (e) {
      console.warn('Could not load my pages for simulator (anon ok)')
    }
  }

  async function loadPageBySlug(slug: string): Promise<AgentPage | null> {
    // Public fetch (published pages)
    const { data } = await supabase
      .from('pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single<AgentPage>()
    return data || null
  }

  async function runSimulationForPage(page: AgentPage) {
    setLoading(true)
    setMessage('')
    setSimulationResults([])
    setRecommendations([])

    try {
      const multi = runMultiAgentSimulation(page, query)
      setSimulationResults(multi.results)
      setRecommendations(getRecommendations(page))

      // Save history if logged in and this is one of my pages (or matched owner)
      if (isLoggedIn) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && (page as any).owner_id === user.id) {
          // Data flywheel: store FULL multi-agent result snapshot (parsed schemas + recs + per-agent readiness)
          // for future model improvement + replay. Modular: history depth can be tiered (Free limited, Pro full).
          const fullSnapshot = {
            query,
            results: multi.results,
            overallReadiness: getReadinessScore(page),
          }
          const newSim = {
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            timestamp: new Date().toISOString(),
            agent: currentAgent,
            query,
            result: fullSnapshot, // full for replay + flywheel
            readiness: getReadinessScore(page),
          }

          const existing = (page as any).simulations || []
          const updated = [newSim, ...existing].slice(0, 20)

          await supabase
            .from('pages')
            .update({ simulations: updated })
            .eq('id', page.id)

          setHistory(updated)
          setMessage('Analysis saved to page history (full multi-agent snapshot for intelligence flywheel).')
        }
      }

      // Always show current agent's result
      const current = multi.results.find(r => r.agent === currentAgent) || multi.results[0]
      setSimulationResults(multi.results)
    } catch (e: any) {
      setMessage('Simulation failed: ' + (e.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectMyPage(page: AgentPage) {
    setSelectedPage(page)
    setPasteSlug('')
    setHistory((page as any).simulations || [])
    await runSimulationForPage(page)
  }

  async function handlePasteAnalyze() {
    if (!pasteSlug.trim()) return
    setLoading(true)
    setMessage('')

    try {
      const page = await loadPageBySlug(pasteSlug.trim().replace(/^\//, ''))
      if (!page) {
        setMessage('Page not found or not published. Try a public Nexez slug.')
        setLoading(false)
        return
      }
      setSelectedPage(page)
      setHistory((page as any).simulations || [])
      await runSimulationForPage(page)
    } catch (e: any) {
      setMessage('Failed to load page: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function regenerate() {
    if (selectedPage) runSimulationForPage(selectedPage)
  }

  function switchAgent(agent: string) {
    setCurrentAgent(agent)
    // results already computed for all; just UI switch
  }

  function exportCurrentAnalysis(format: 'md' | 'json' = 'md') {
    if (!selectedPage || !simulationResults.length) return
    const pageInfo = selectedPage
    const readiness = getReadinessScore(pageInfo)
    const recs = recommendations

    let content = ''
    if (format === 'json') {
      content = JSON.stringify({
        page: { name: pageInfo.name, slug: pageInfo.slug, readiness },
        query,
        timestamp: new Date().toISOString(),
        agents: simulationResults,
        recommendations: recs,
      }, null, 2)
    } else {
      content = `# Nexez Agent Simulator Analysis\n\n`
      content += `**Page**: ${pageInfo.name} (/${pageInfo.slug})\n`
      content += `**Readiness**: ${readiness}/100\n`
      content += `**Query**: ${query}\n`
      content += `**Generated**: ${new Date().toISOString()}\n\n`
      content += `## Recommendations\n${recs.length ? recs.map(r => `- ${r}`).join('\n') : '- Page is well optimized.'}\n\n`
      content += `## Per-Agent Analysis\n`
      simulationResults.forEach((r: any) => {
        content += `\n### ${r.agent}\n`
        content += `- Readiness: ${r.readiness}\n`
        if (r.schema) content += `- Parsed Schema: ${JSON.stringify(r.schema.page || r.schema, null, 0).slice(0, 300)}...\n`
      })
      content += `\n---\nExported from Nexez Global Simulator. Use to brief agents or improve your page.`
    }

    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nexez-sim-${pageInfo.slug}-${Date.now()}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setMessage(`Exported ${format.toUpperCase()} analysis (shareable).`)
  }

  function loadFromHistory(h: any) {
    // Replay a prior full snapshot if present (data flywheel benefit: instant previous view)
    if (h.result && h.result.results) {
      setSimulationResults(h.result.results)
      setRecommendations(h.result.recommendations || getRecommendations(selectedPage!))
      setQuery(h.query || query)
      setMessage(`Loaded historical analysis from ${new Date(h.timestamp).toLocaleString()}.`)
    } else if (h.result) {
      // legacy single
      setSimulationResults([h.result])
      setMessage('Loaded legacy snapshot.')
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <ErrorBoundary>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
                <ArrowLeft className="size-4" />
                Dashboard
              </a>
              <p className="mt-2 text-sm text-[#9CA3AF]">Global Agent Simulator</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter">See how any AI agent parses a Nexez page</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="/directory" className="btn-secondary text-sm">Browse Directory</a>
              {selectedPage && (
                <a href={`/dashboard/${(selectedPage as any).id || ''}/test`} className="btn-secondary text-sm">
                  Deep per-page simulator →
                </a>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="grid gap-4 lg:grid-cols-2 mb-8">
            {/* My Pages */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="size-4 text-[#7C3AED]" />
                <span className="font-medium">Analyze one of my pages</span>
              </div>
              {isLoggedIn && myPages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {myPages.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectMyPage(p)}
                      className={`rounded border px-3 py-1 text-sm ${selectedPage?.id === p.id ? 'border-[#7C3AED] bg-[#7C3AED]/10' : 'border-white/15 hover:bg-white/5'}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">Sign in to see your published pages. Or paste a public slug below.</p>
              )}
            </div>

            {/* Paste */}
            <div className="card">
              <div className="font-medium mb-2">Paste a public Nexez slug or URL</div>
              <div className="flex gap-2">
                <input
                  value={pasteSlug}
                  onChange={(e) => setPasteSlug(e.target.value)}
                  placeholder="my-offers or https://nexez.com/my-offers"
                  className="input flex-1"
                />
                <button onClick={handlePasteAnalyze} disabled={loading} className="btn-primary">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Analyze
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">Must be a published Nexez page for full structured fidelity.</p>
            </div>
          </div>

          {/* Query + Actions */}
          {selectedPage && (
            <div className="mb-6 flex flex-col md:flex-row gap-3 items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input flex-1"
                placeholder="What would an agent ask?"
              />
              <button onClick={regenerate} disabled={loading} className="btn-ghost">
                <RefreshCw className="size-4" /> Regenerate Analysis
              </button>
              <a href={`/${selectedPage.slug}`} target="_blank" className="btn-secondary inline-flex items-center gap-1">
                View public page <ExternalLink className="size-3" />
              </a>
            </div>
          )}

          {/* Results */}
          {selectedPage && simulationResults.length > 0 && (
            <>
              <div className="flex border-b border-white/10 mb-6 overflow-x-auto">
                {agentTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => switchAgent(tab)}
                    className={`agent-tab px-6 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                      currentAgent === tab 
                        ? 'border-[#7C3AED] text-white bg-[#1A1625]' 
                        : 'border-transparent text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Page summary */}
                <div className="card">
                  <div className="flex justify-between mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Selected Page</p>
                      <h3 className="text-xl font-semibold">{selectedPage.name}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-semibold text-[#10B981]">{getReadinessScore(selectedPage)}</div>
                      <div className="text-xs text-[#9CA3AF] -mt-1">READINESS</div>
                    </div>
                  </div>
                  <p className="text-[#9CA3AF]">{selectedPage.description}</p>
                  <div className="mt-4 text-sm text-zinc-400">/{selectedPage.slug} • {getOfferCount(selectedPage)} offers</div>
                </div>

                {/* Right: Current agent view */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Agent Understanding</p>
                      <h3 className="text-xl font-semibold">{currentAgent}'s view</h3>
                    </div>
                  </div>

                  <div className="min-h-[280px] rounded-2xl bg-[#12101B] border border-white/10 p-5 text-sm">
                    {simulationResults.find(r => r.agent === currentAgent) && (
                      <pre className="font-mono text-xs text-[#C4B5FD] whitespace-pre-wrap overflow-auto max-h-[260px]">
                        {JSON.stringify(simulationResults.find(r => r.agent === currentAgent)?.schema, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommendations + History + Export (data flywheel + shareable) */}
              <div className="mt-8 grid md:grid-cols-2 gap-6">
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <RefreshCw className="size-4 text-[#F59E0B]" /> Recommendations
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={() => exportCurrentAnalysis('md')} className="text-[10px] rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Export MD</button>
                      <button onClick={() => exportCurrentAnalysis('json')} className="text-[10px] rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Export JSON</button>
                    </div>
                  </div>
                  <div className="text-sm text-[#9CA3AF] space-y-1">
                    {recommendations.length ? recommendations.map((r, i) => <div key={i}>• {r}</div>) : 'Page is well optimized.'}
                  </div>
                  <p className="mt-3 text-[10px] text-zinc-500">Exports are clean & shareable (paste into agent prompts or reports). Captured data improves Nexez scoring models over time (flywheel).</p>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <History className="size-4 text-[#7C3AED]" /> Simulation History (saved to page)
                    </h3>
                    <span className="text-xs text-zinc-500">{history.length} runs</span>
                  </div>
                  {history.length > 0 ? (
                    <div className="space-y-2 text-sm max-h-52 overflow-auto">
                      {history.map((h, idx) => (
                        <div key={idx} className="rounded border border-white/10 p-2 text-xs flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-[#C4B5FD]">{h.agent || 'multi'}</span> — { (h.query || '').slice(0, 32) }...
                            <div className="text-[10px] text-zinc-500">{new Date(h.timestamp).toLocaleString()}</div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => loadFromHistory(h)} className="text-[10px] rounded bg-[#7C3AED]/20 px-2 py-0.5 hover:bg-[#7C3AED]/40">Load</button>
                            <span className="text-emerald-400/80 text-[10px] self-center">{h.readiness || '?'}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">Run analyses while viewing one of your pages to save history (full snapshots for replay + future model training).</div>
                  )}
                  <p className="mt-2 text-[10px] text-zinc-500">Click Load to replay prior full multi-agent view. (Modular: future tiers can unlock deeper history/export analytics.)</p>
                </div>
              </div>
            </>
          )}

          {!selectedPage && (
            <div className="card text-center py-12">
              <Bot className="mx-auto size-8 text-[#7C3AED] mb-4" />
              <p className="text-xl font-medium">Select or paste a page above to begin multi-agent simulation.</p>
              <p className="mt-2 text-[#9CA3AF]">Results show exactly how ChatGPT, Claude, Grok, Perplexity and generic agents would parse and act on the structured offers, CTAs, and prefer-original rules.</p>
            </div>
          )}

          {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
        </div>
      </ErrorBoundary>
    </main>
  )
}
