'use client'

import React, { useEffect, useState } from 'react'
import {
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
  BASIC_OWNER_PAGE_SELECT,
  OWNER_PAGE_SELECT,
  PUBLIC_PAGE_SELECT,
  getOfferCount,
  getReadinessScore,
} from '../../lib/agent-page'
import {
  DEFAULT_AGENT_QUERY,
  buildDefaultAgentQuery,
  getRecommendations,
  runMultiAgentSimulation,
} from '../../lib/agent-simulator'
import {
  SimulationHistoryEntry,
  buildSimulationHistoryEntry,
  exportSimulationHistory,
  filterSimulationHistory,
  getSimulationHistoryStats,
  normalizeSimulatorTarget,
} from '../../lib/simulation-history'
import { createClient } from '../../utils/supabase/client'
import { agentRuntimeUrl, appUrl } from '../../lib/site'

const agentTabs = ['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Generic Agent', 'LLM-Enhanced']

export default function GlobalAgentSimulator() {
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [myPages, setMyPages] = useState<AgentPage[]>([])
  const [selectedPage, setSelectedPage] = useState<AgentPage | null>(null)
  const [pasteSlug, setPasteSlug] = useState('')
  const [query, setQuery] = useState(DEFAULT_AGENT_QUERY)
  const [currentAgent, setCurrentAgent] = useState(agentTabs[0])
  const [simulationResults, setSimulationResults] = useState<any[]>([])
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [history, setHistory] = useState<SimulationHistoryEntry[]>([])
  const [historyQuery, setHistoryQuery] = useState('')
  const [message, setMessage] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const supabase = createClient()
  const filteredHistory = filterSimulationHistory(history, historyQuery)
  const historyStats = getSimulationHistoryStats(history)

  function isMissingColumnError(error: { code?: string; message?: string }) {
    return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
  }

  useEffect(() => {
    setHydrated(true)
  }, [])

  async function fetchOwnedPublishedPages(ownerId: string) {
    const result = await supabase
      .from('pages')
      .select(OWNER_PAGE_SELECT)
      .eq('owner_id', ownerId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20)
      .returns<AgentPage[]>()

    if (!result.error || !isMissingColumnError(result.error)) {
      return result
    }

    return supabase
      .from('pages')
      .select(BASIC_OWNER_PAGE_SELECT)
      .eq('owner_id', ownerId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20)
      .returns<AgentPage[]>()
  }

  async function loadMyPages() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsLoggedIn(false)
        return
      }
      setIsLoggedIn(true)

      const { data, error } = await fetchOwnedPublishedPages(user.id)

      if (data && !error) {
        setMyPages(data as unknown as AgentPage[])
      }
    } catch (e) {
      console.warn('Could not load my pages for simulator (anon ok)')
    }
  }

  useEffect(() => {
    loadMyPages()
  }, [])

  async function loadPageBySlug(slug: string): Promise<AgentPage | null> {
    // Public "analyze a page by slug" flow — runs as anon for logged-out users, so
    // it reads the redacted public view (offer `rules` stripped), not the base table.
    const result = await supabase
      .from('pages_public')
      .select(PUBLIC_PAGE_SELECT)
      .eq('slug', slug)
      .single<AgentPage>()

    if (!result.error || !isMissingColumnError(result.error)) {
      return result.data || null
    }

    const fallback = await supabase
      .from('pages_public')
      .select(BASIC_OWNER_PAGE_SELECT)
      .eq('slug', slug)
      .single<AgentPage>()

    return fallback.data || null
  }

  async function runSimulationForPage(page: AgentPage, nextQuery = query) {
    setLoading(true)
    setMessage('')
    setSimulationResults([])
    setRecommendations([])

    try {
      const effectiveQuery = nextQuery.trim() || buildDefaultAgentQuery(page)
      const multi = runMultiAgentSimulation(page, effectiveQuery, window.location.origin)
      let finalResults = multi.results
      setSimulationResults(finalResults)
      setRecommendations(getRecommendations(page))
      if (effectiveQuery !== query) setQuery(effectiveQuery)

      // Deeper LLM responses via new route if LLM configured and page llm_opt_in or global
      if ((page as any).llm_opt_in) {
        try {
          const llmRes = await fetch('/api/simulate-llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: page.slug, query: effectiveQuery }),
          })
          const llmData = await llmRes.json()
          if (llmData?.naturalLanguage) {
            const firstResult = multi.results[0]
            if (firstResult) {
              finalResults = [
                ...multi.results,
                {
                  ...firstResult,
                  agent: 'LLM-Enhanced',
                  naturalLanguage: llmData.naturalLanguage,
                  llmEnhanced: true,
                } as any,
              ]
              setCurrentAgent('LLM-Enhanced')
              setSimulationResults(finalResults)
            }
          }
        } catch (e) {
          // fallback to deterministic
        }
      }

      // Save history if logged in and this is one of my pages (or matched owner)
      if (isLoggedIn) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && (page as any).owner_id === user.id) {
          const newSim = buildSimulationHistoryEntry(page, effectiveQuery, window.location.origin, finalResults)

          const existing = Array.isArray((page as any).simulations) ? (page as any).simulations : history
          const updated = [newSim, ...existing].slice(0, 20)

          const { error } = await supabase
            .from('pages')
            .update({ simulations: updated })
            .eq('id', page.id)

          if (error && isMissingColumnError(error)) {
            setMessage('Analysis complete. Apply the simulations migration to persist history for this page.')
          } else if (error) {
            setMessage(`Analysis complete, but history could not be saved: ${error.message}`)
          } else {
            setHistory(updated as SimulationHistoryEntry[])
            setSelectedPage({ ...page, simulations: updated } as AgentPage)
            setMessage('Analysis saved to page history (full multi-agent snapshot for intelligence flywheel).')
          }
        }
      }
    } catch (e: any) {
      setMessage('Simulation failed: ' + (e.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectMyPage(page: AgentPage) {
    const nextQuery = buildDefaultAgentQuery(page)
    setSelectedPage(page)
    setPasteSlug('')
    setQuery(nextQuery)
    setHistory(Array.isArray((page as any).simulations) ? (page as any).simulations : [])
    setHistoryQuery('')
    await runSimulationForPage(page, nextQuery)
  }

  async function handlePasteAnalyze() {
    if (!pasteSlug.trim()) return
    setLoading(true)
    setMessage('')

    try {
      const slug = normalizeSimulatorTarget(pasteSlug)
      const page = await loadPageBySlug(slug)
      if (!page) {
        setMessage('Page not found or not published. Try a public Nexez slug.')
        setLoading(false)
        return
      }
      const nextQuery = buildDefaultAgentQuery(page)
      setSelectedPage(page)
      setQuery(nextQuery)
      setHistory(Array.isArray((page as any).simulations) ? (page as any).simulations : [])
      setHistoryQuery('')
      await runSimulationForPage(page, nextQuery)
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

  function exportCurrentAnalysis(format: 'md' | 'json' | 'pdf' = 'md') {
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

    if (format === 'pdf') {
      const printWin = window.open('', '', 'height=600,width=800')
      if (printWin) {
        printWin.document.write(`<html><head><title>Nexez Simulator - ${pageInfo.slug}</title></head><body><pre style="white-space: pre-wrap; font-family: monospace; padding: 20px;">${content.replace(/</g, '&lt;')}</pre></body></html>`)
        printWin.document.close()
        printWin.focus()
        setTimeout(() => printWin.print(), 500)
      }
      setMessage('Opened print dialog for PDF export (save as PDF).')
      return
    }
    downloadTextFile(
      content,
      `nexez-sim-${pageInfo.slug}-${getExportTimestamp()}.${format}`,
      format === 'json' ? 'application/json' : 'text/markdown',
    )
    setMessage(`Exported ${format.toUpperCase()} analysis (shareable).`)
  }

  function exportHistory() {
    if (!selectedPage || !history.length) return

    const content = JSON.stringify(exportSimulationHistory(history, selectedPage), null, 2)
    downloadTextFile(content, `nexez-sim-history-${selectedPage.slug}-${getExportTimestamp()}.json`, 'application/json')
    setMessage('Exported full simulation history JSON.')
  }

  function getExportTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-')
  }

  function downloadTextFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
              <p className="text-sm text-[#9CA3AF]">Global Agent Simulator</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter">Test agent parsing</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="/directory" className="btn-secondary text-sm">Browse Directory</a>
              {selectedPage && (
                <a href={appUrl(`/dashboard/${(selectedPage as any).id || ''}/test`)} className="btn-secondary text-sm">
                  Per-page simulator →
                </a>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="grid gap-4 lg:grid-cols-2 mb-8">
            {/* My Pages */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="size-4 text-[var(--signal)]" />
                <span className="font-medium">Analyze my page</span>
              </div>
              {isLoggedIn && myPages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {myPages.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectMyPage(p)}
                      disabled={!hydrated || loading}
                      className={`rounded border px-3 py-1 text-sm ${selectedPage?.id === p.id ? 'border-[var(--signal)] bg-[var(--signal)]/10' : 'border-white/15 hover:bg-white/5'}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">
                  Paste a public slug or URL below to try it now —{' '}
                  <a href={appUrl('/dashboard')} className="underline hover:text-white">
                    sign in to test your own pages
                  </a>{' '}
                </p>
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
                  disabled={!hydrated || loading}
                  className="input flex-1"
                />
                <button onClick={handlePasteAnalyze} disabled={!hydrated || loading || !pasteSlug.trim()} className="btn-primary">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Analyze
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">Published pages only.</p>
            </div>
          </div>

          {/* Query + Actions */}
          {selectedPage && (
            <div className="mb-6 flex flex-col md:flex-row gap-3 items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input flex-1"
                placeholder="Agent query"
                disabled={!hydrated || loading}
              />
              <button onClick={regenerate} disabled={!hydrated || loading} className="btn-ghost">
                <RefreshCw className="size-4" /> Rerun
              </button>
              <a href={agentRuntimeUrl(`/${selectedPage.slug}`)} target="_blank" className="btn-secondary inline-flex items-center gap-1">
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
                        ? 'border-[var(--signal)] text-white bg-[#1A1625]' 
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
                      <div className="text-3xl font-semibold text-[var(--ready)]">{getReadinessScore(selectedPage)}</div>
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
                      <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Agent Parse</p>
                      <h3 className="text-xl font-semibold">{currentAgent}'s view</h3>
                    </div>
                  </div>

                  <div className="min-h-[280px] rounded-2xl bg-[#12101B] border border-white/10 p-5 text-sm">
                    {simulationResults.find(r => r.agent === currentAgent) && (
                      <pre className="font-mono text-xs text-[var(--signal)] whitespace-pre-wrap overflow-auto max-h-[260px]">
                        {JSON.stringify(simulationResults.find(r => r.agent === currentAgent)?.schema, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <HistoryStat label="Saved runs" value={String(historyStats.totalRuns)} />
                <HistoryStat label="Latest readiness" value={`${historyStats.latestReadiness || getReadinessScore(selectedPage)}%`} />
                <HistoryStat label="Avg readiness" value={`${historyStats.averageReadiness || getReadinessScore(selectedPage)}%`} />
                <HistoryStat
                  label="Readiness trend"
                  value={historyStats.readinessDelta > 0 ? `+${historyStats.readinessDelta}` : String(historyStats.readinessDelta)}
                  tone={historyStats.readinessDelta >= 0 ? 'good' : 'warn'}
                />
              </div>

              {/* Recommendations + History + Export (data flywheel + shareable) */}
              <div className="mt-8 grid md:grid-cols-2 gap-6">
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <RefreshCw className="size-4 text-[var(--amber)]" /> Recommendations
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={() => exportCurrentAnalysis('md')} className="text-[10px] rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Export MD</button>
                      <button onClick={() => exportCurrentAnalysis('json')} className="text-[10px] rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Export JSON</button>
                      <button onClick={() => exportCurrentAnalysis('pdf')} className="text-[10px] rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Export PDF (print)</button>
                    </div>
                  </div>
                  <div className="text-sm text-[#9CA3AF] space-y-1">
                    {recommendations.length ? recommendations.map((r, i) => <div key={i}>• {r}</div>) : 'Page is well optimized.'}
                  </div>
                  <p className="mt-3 text-[10px] text-zinc-500">Shareable agent report.</p>
                </div>

                <div className="card">
                  <div className="flex flex-col gap-3 mb-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <History className="size-4 text-[var(--signal)]" /> Simulation History
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">{history.length} saved runs for this page</p>
                    </div>
                    <button
                      onClick={exportHistory}
                      disabled={!history.length}
                      className="rounded border border-white/20 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      Export History JSON
                    </button>
                  </div>
                  {history.length > 0 ? (
                    <input
                      value={historyQuery}
                      onChange={(event) => setHistoryQuery(event.target.value)}
                      className="input mb-3 h-10 text-xs"
                      placeholder="Search history by query, readiness, or agent..."
                    />
                  ) : null}
                  {historyStats.latestQuery ? (
                    <button
                      onClick={() => setQuery(historyStats.latestQuery)}
                      className="mb-3 w-full rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/10 px-3 py-2 text-left text-xs text-[var(--signal)] hover:bg-[var(--signal)]/15"
                    >
                      Use latest query: {historyStats.latestQuery.slice(0, 90)}
                    </button>
                  ) : null}
                  {filteredHistory.length > 0 ? (
                    <div className="space-y-2 text-sm max-h-64 overflow-auto">
                      {filteredHistory.map((h, idx) => (
                        <div key={h.id || idx} className="rounded border border-white/10 p-2 text-xs flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-[var(--signal)]">{h.agent || 'multi'}</span> — { (h.query || '').slice(0, 52) }{(h.query || '').length > 52 ? '...' : ''}
                            <div className="text-[10px] text-zinc-500">{new Date(h.timestamp).toLocaleString()}</div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => loadFromHistory(h)} className="text-[10px] rounded bg-[var(--signal)]/20 px-2 py-1 hover:bg-[var(--signal)]/40">Load</button>
                            <span className="text-[var(--ready)]/80 text-[10px] self-center">{h.readiness || '?'}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : history.length > 0 ? (
                    <div className="rounded border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                      No history runs match that search.
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">Run analyses to save history.</div>
                  )}
                  <p className="mt-2 text-[10px] text-zinc-500">Load replays prior parse.</p>
                </div>
              </div>
            </>
          )}

          {!selectedPage && (
            <div className="card text-center py-12">
              <Bot className="mx-auto size-8 text-[var(--signal)] mb-4" />
              <p className="text-xl font-medium">Start multi-agent simulation.</p>
              <p className="mt-2 text-[#9CA3AF]">ChatGPT, Claude, Grok, Perplexity.</p>
            </div>
          )}

          {message && <p className="mt-4 text-sm text-[var(--ready)]">{message}</p>}
        </div>
      </ErrorBoundary>
    </main>
  )
}

function HistoryStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="card !p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'good' ? 'text-[var(--ready)]' : tone === 'warn' ? 'text-[var(--amber)]' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}
