'use client'

import React, { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  Globe,
  History,
  Loader2,
  MinusCircle,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { CompetitorCompare } from '../../components/simulator/CompetitorCompare'
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
  gradeAgentSuccess,
  runMultiAgentSimulation,
  type AgentSuccessReport,
  type AgentVerdict,
} from '../../lib/agent-simulator'
import { analyzeQueryRank, type QueryRankAnalysis } from '../../lib/agent-search'
import type { UrlSimComparison } from '../../lib/url-simulation'
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
  const [successReport, setSuccessReport] = useState<AgentSuccessReport | null>(null)
  const [rankAnalysis, setRankAnalysis] = useState<QueryRankAnalysis | null>(null)
  // "Simulate any URL" — public, logged-out demo (deterministic crawl).
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlComparison, setUrlComparison] = useState<UrlSimComparison | null>(null)
  const [history, setHistory] = useState<SimulationHistoryEntry[]>([])
  const [historyQuery, setHistoryQuery] = useState('')
  const [message, setMessage] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  // Which lens of the Agent Lab is active. 'test' (your page / any slug), 'url'
  // (simulate any website), or 'compare' (score a competitor — signed-in).
  const [mode, setMode] = useState<'test' | 'url' | 'compare'>('test')

  const supabase = createClient()
  const filteredHistory = filterSimulationHistory(history, historyQuery)
  const historyStats = getSimulationHistoryStats(history)
  const currentResult = simulationResults.find((r) => r.agent === currentAgent)
  const currentVerdict: AgentVerdict | undefined = currentResult?.verdict
  const ownsSelected = !!selectedPage && myPages.some((p) => p.id === selectedPage.id)

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
    // Deep-link support: /simulator?mode=compare|url (used by the editor toolbar,
    // AI co-pilot, and the retired /dashboard/competitors redirect).
    const m = new URLSearchParams(window.location.search).get('mode')
    if (m === 'compare' || m === 'url' || m === 'test') setMode(m)
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

  // Rank `page` against the live published field for `q`, using the same
  // relevance+readiness ranking /api/agent-search applies. Best-effort: on any
  // read failure the panel simply doesn't render.
  async function computeRankAnalysis(page: AgentPage, q: string) {
    try {
      const { data, error } = await supabase
        .from('pages_public')
        .select(PUBLIC_PAGE_SELECT)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<AgentPage[]>()
      const field = error ? [] : data ?? []
      setRankAnalysis(analyzeQueryRank(field, page, q))
    } catch {
      setRankAnalysis(null)
    }
  }

  async function runSimulationForPage(page: AgentPage, nextQuery = query) {
    setLoading(true)
    setMessage('')
    setSimulationResults([])
    setRecommendations([])
    setSuccessReport(null)
    setRankAnalysis(null)

    try {
      const effectiveQuery = nextQuery.trim() || buildDefaultAgentQuery(page)
      const multi = runMultiAgentSimulation(page, effectiveQuery, window.location.origin)
      let finalResults = multi.results
      setSimulationResults(finalResults)
      setRecommendations(getRecommendations(page))
      setSuccessReport(multi.success)
      // Win-the-query: rank this page against the live published field for the
      // same query (read pages_public directly, like loadPageBySlug, so it works
      // same-origin on both the marketing and app hosts).
      void computeRankAnalysis(page, effectiveQuery)
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
    setUrlComparison(null)
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
      setUrlComparison(null)
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

  // Public "simulate any website" demo: crawl any URL (deterministic, server-side
  // SSRF-guarded) and show raw-vs-agent-ready. Independent of the Nexez-page flow,
  // so it clears any selected page to avoid mixing the two views.
  async function handleSimulateUrl() {
    const url = urlInput.trim()
    if (!url) return
    setUrlLoading(true)
    setMessage('')
    setUrlComparison(null)
    setSelectedPage(null)
    setSimulationResults([])
    setSuccessReport(null)
    setRankAnalysis(null)
    try {
      const res = await fetch('/api/simulate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setMessage(data?.error || 'Could not analyze that URL. Try a public business website.')
        return
      }
      setUrlComparison(data as UrlSimComparison)
    } catch {
      setMessage('Could not reach the analyzer. Please try again.')
    } finally {
      setUrlLoading(false)
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
      if (selectedPage) {
        setSuccessReport(gradeAgentSuccess(selectedPage, h.query || query))
        void computeRankAnalysis(selectedPage, h.query || query)
      }
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
          <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-[#9CA3AF]">Agent Lab</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter">Test, simulate &amp; compare</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="/discovery" className="btn-secondary text-sm">Browse Discovery</a>
              {mode === 'test' && selectedPage && (
                <a href={appUrl(`/dashboard/${(selectedPage as any).id || ''}/test`)} className="btn-secondary text-sm">
                  Per-page simulator →
                </a>
              )}
            </div>
          </div>

          {/* Mode tabs — the three lenses of the Agent Lab */}
          <div className="mb-8 flex flex-wrap gap-2">
            {([
              { key: 'test', label: 'Test a page', icon: Bot },
              { key: 'url', label: 'Any URL', icon: Globe },
              { key: 'compare', label: 'Compare a competitor', icon: Target },
            ] as const).map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  mode === m.key
                    ? 'border-[var(--signal)] bg-[var(--signal)]/10 text-white'
                    : 'border-white/15 text-[#9CA3AF] hover:text-white hover:bg-white/5'
                }`}
              >
                <m.icon className="size-4" /> {m.label}
                {m.key === 'compare' && !isLoggedIn && <span className="text-[10px] text-zinc-500">(sign in)</span>}
              </button>
            ))}
          </div>

          {/* ── TEST A PAGE ───────────────────────────────────────────── */}
          {mode === 'test' && (
          <>
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
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Agent Verdict</p>
                      <h3 className="text-xl font-semibold">{currentAgent}&apos;s view</h3>
                    </div>
                    {currentVerdict && !currentResult?.llmEnhanced && <StanceBadge stance={currentVerdict.stance} />}
                  </div>

                  <div className="min-h-[280px] rounded-2xl bg-[#12101B] border border-white/10 p-5 text-sm">
                    {currentResult?.llmEnhanced ? (
                      <div className="space-y-3">
                        <p className="text-[11px] uppercase tracking-wide text-[var(--signal)]">LLM-enhanced response</p>
                        <p className="leading-relaxed whitespace-pre-wrap text-zinc-200">{currentResult.naturalLanguage}</p>
                      </div>
                    ) : currentVerdict ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Optimizing for</p>
                          <p className="text-zinc-300">{currentVerdict.lens}</p>
                        </div>
                        <p className="text-base leading-snug text-white">{currentVerdict.headline}</p>
                        {currentVerdict.noticed.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--ready)]">Noticed</p>
                            <ul className="mt-1 space-y-1">
                              {currentVerdict.noticed.map((n, i) => (
                                <li key={i} className="flex gap-2 text-zinc-300">
                                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--ready)]" /> <span>{n}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {currentVerdict.gaps.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--amber)]">Would want</p>
                            <ul className="mt-1 space-y-1">
                              {currentVerdict.gaps.map((g, i) => (
                                <li key={i} className="flex gap-2 text-zinc-300">
                                  <span className="mt-0.5 text-[var(--amber)]">•</span> <span>{g}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">Raw agent.json parse</summary>
                          <pre className="mt-2 font-mono text-xs text-[var(--signal)] whitespace-pre-wrap overflow-auto max-h-[220px]">
                            {JSON.stringify(currentResult?.schema, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : currentResult ? (
                      <pre className="font-mono text-xs text-[var(--signal)] whitespace-pre-wrap overflow-auto max-h-[260px]">
                        {JSON.stringify(currentResult?.schema, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                </div>
              </div>

              {successReport && (
                <div className="card mt-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Agent Success Score</p>
                      <h3 className="text-xl font-semibold">Can an agent finish a buyer&apos;s request?</h3>
                      <p className="mt-1 max-w-xl text-sm text-zinc-400">{successReport.summary}</p>
                    </div>
                    <ScoreDial score={successReport.score} verdict={successReport.verdict} />
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {successReport.checks.map((c) => (
                      <CheckRow key={c.key} check={c} canFix={ownsSelected} pageId={selectedPage?.id} />
                    ))}
                  </div>
                  {!ownsSelected && (
                    <p className="mt-3 text-[11px] text-zinc-500">Sign in and select your own page to get one-click fixes for each gap.</p>
                  )}
                </div>
              )}

              {rankAnalysis && <WinQueryPanel a={rankAnalysis} query={query} />}

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
              <p className="text-xl font-medium">Pick one of your pages or paste a public slug.</p>
              <p className="mt-2 text-[#9CA3AF]">See it judged by ChatGPT, Claude, Grok, and Perplexity — with a success score and where it ranks.</p>
            </div>
          )}
          </>
          )}

          {/* ── ANY URL ──────────────────────────────────────────────── */}
          {mode === 'url' && (
          <>
            <div className="card mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="size-4 text-[var(--ready)]" />
                <span className="font-medium">Simulate any website</span>
                <span className="rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--ready)]">No account needed</span>
              </div>
              <p className="mb-3 text-sm text-zinc-400">See what an AI agent gets from any business site today — and what it would get if the same business were agent-ready on Nexez.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !urlLoading && urlInput.trim()) handleSimulateUrl() }}
                  placeholder="https://any-business.com"
                  disabled={!hydrated || urlLoading}
                  className="input flex-1"
                />
                <button onClick={handleSimulateUrl} disabled={!hydrated || urlLoading || !urlInput.trim()} className="btn-primary">
                  {urlLoading ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />} Simulate
                </button>
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">Public pages only · we crawl, never store your input · deterministic (no AI cost).</p>
            </div>

            {urlComparison && <UrlComparisonPanel c={urlComparison} />}
          </>
          )}

          {/* ── COMPARE A COMPETITOR (signed-in) ─────────────────────── */}
          {mode === 'compare' && <CompetitorCompare isLoggedIn={isLoggedIn} myPages={myPages} />}

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

const STANCE_META: Record<AgentVerdict['stance'], { label: string; cls: string; Icon: typeof Check }> = {
  recommend: { label: 'Would recommend', cls: 'border-[var(--ready)]/40 bg-[var(--ready)]/10 text-[var(--ready)]', Icon: Check },
  needs_info: { label: 'Needs more info', cls: 'border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]', Icon: MinusCircle },
  skip: { label: 'Would skip', cls: 'border-red-500/40 bg-red-500/10 text-red-400', Icon: X },
}

function StanceBadge({ stance }: { stance: AgentVerdict['stance'] }) {
  const m = STANCE_META[stance]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${m.cls}`}>
      <m.Icon className="size-3.5" /> {m.label}
    </span>
  )
}

function ScoreDial({ score, verdict }: { score: number; verdict: AgentSuccessReport['verdict'] }) {
  const tone =
    verdict === 'ready' ? 'text-[var(--ready)]' : verdict === 'partial' ? 'text-[var(--amber)]' : 'text-red-400'
  const label = verdict === 'ready' ? 'Agent-ready' : verdict === 'partial' ? 'Partial' : 'Blocked'
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#12101B] px-5 py-3">
      <div className={`text-4xl font-semibold tabular-nums ${tone}`}>{score}</div>
      <div className="leading-tight">
        <div className="text-xs text-zinc-500">/ 100</div>
        <div className={`text-sm font-medium ${tone}`}>{label}</div>
      </div>
    </div>
  )
}

function WinQueryPanel({ a, query }: { a: QueryRankAnalysis; query: string }) {
  const tone = !a.matched ? 'text-[var(--amber)]' : a.rank === 1 ? 'text-[var(--ready)]' : a.rank <= 3 ? 'text-[var(--signal)]' : 'text-[var(--amber)]'
  return (
    <div className="card mt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Win the Query</p>
          <h3 className="text-xl font-semibold">When an agent searches Nexez for this, where do you land?</h3>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Query: <span className="text-zinc-200">“{query}”</span>
            {!a.published && <span className="ml-1 text-[var(--amber)]">· projected (unpublished)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#12101B] px-5 py-3">
          {a.matched ? (
            <>
              <div className={`text-4xl font-semibold tabular-nums ${tone}`}>#{a.rank}</div>
              <div className="leading-tight">
                <div className="text-xs text-zinc-500">of {a.field} competing</div>
                <div className={`text-sm font-medium ${tone}`}>{a.rank === 1 ? 'Top result' : 'Ranked'}</div>
              </div>
            </>
          ) : (
            <div className="leading-tight">
              <div className={`text-lg font-semibold ${tone}`}>Not surfacing</div>
              <div className="text-xs text-zinc-500">for this query</div>
            </div>
          )}
        </div>
      </div>

      {a.competitorsAbove.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Who beats you, and why</p>
          <div className="mt-2 space-y-2">
            {a.competitorsAbove.map((c, i) => (
              <div key={c.slug} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    <span className="text-zinc-500">#{i + 1}</span> {c.name}
                  </p>
                  <span className="shrink-0 text-[11px] text-zinc-500">readiness {c.readiness}%</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {c.reasons.map((r, j) => (
                    <li key={j} className="text-xs text-zinc-400">• {r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.toWin.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--ready)]">How to win</p>
          <ul className="mt-1 space-y-1">
            {a.toWin.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-[var(--ready)]" /> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function UrlSignalTag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
        ok ? 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]' : 'border-white/10 bg-white/[0.02] text-zinc-500'
      }`}
    >
      {ok ? <Check className="size-3" /> : <X className="size-3" />} {label}
    </span>
  )
}

function UrlComparisonPanel({ c }: { c: UrlSimComparison }) {
  const ar = c.agentReady
  return (
    <div className="card mb-8">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[2px] text-[#9CA3AF]">Any-URL Simulation</p>
        <h3 className="text-xl font-semibold">What an AI agent sees on {c.host}</h3>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">{c.verdict}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Raw site today */}
        <div className="rounded-2xl border border-white/10 bg-[#12101B] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-300">Raw site today</p>
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400">Not actionable</span>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Page title (all an agent gets for free)</dt>
              <dd className="text-zinc-200">{c.raw.title || '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-zinc-400">{c.raw.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <UrlSignalTag ok={c.raw.nativeStructuredData} label="schema.org data" />
            <UrlSignalTag ok={c.raw.nativeAgentDocs} label="agent.json / llms.txt" />
            <UrlSignalTag ok={false} label="callable checkout" />
            <UrlSignalTag ok={false} label="unified offer list" />
          </div>
        </div>

        {/* Agent-ready on Nexez */}
        <div className="rounded-2xl border border-[var(--ready)]/25 bg-[var(--ready)]/[0.04] p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
              <Sparkles className="size-3.5 text-[var(--ready)]" /> As an agent-ready Nexez page
            </p>
            <span className="text-2xl font-semibold tabular-nums text-[var(--ready)]">
              {ar.readiness}
              <span className="text-xs text-zinc-500">/100</span>
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            {ar.offerCount} offer{ar.offerCount === 1 ? '' : 's'}
            {ar.pricedCount ? ` · ${ar.pricedCount} priced` : ''}
            {ar.faqCount ? ` · ${ar.faqCount} FAQ${ar.faqCount === 1 ? '' : 's'}` : ''}
            {` · crawled ${ar.pagesAnalyzed} page${ar.pagesAnalyzed === 1 ? '' : 's'}`}
          </p>
          {ar.offers.length > 0 ? (
            <ul className="mt-3 max-h-52 space-y-1.5 overflow-auto">
              {ar.offers.slice(0, 8).map((o, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-zinc-200">{o.name}</span>
                  <span className="shrink-0 font-mono text-xs text-[var(--ready)]">{o.price || '—'}</span>
                </li>
              ))}
              {ar.offers.length > 8 && <li className="text-[11px] text-zinc-500">+{ar.offers.length - 8} more</li>}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">No offers auto-detected from the public pages — you&apos;d add them in the builder.</p>
          )}
        </div>
      </div>

      {/* What Nexez adds + CTA */}
      <div className="mt-5 grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--ready)]">What Nexez adds</p>
          <ul className="mt-1 space-y-1">
            {c.gains.map((g, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--ready)]" /> <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-white/10 bg-[#12101B] p-4">
          <p className="text-sm text-zinc-300">Make {c.host} agent-ready</p>
          <a href={appUrl('/create')} className="btn-primary justify-center">
            Build this page <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </div>
  )
}

function CheckRow({
  check,
  canFix,
  pageId,
}: {
  check: AgentSuccessReport['checks'][number]
  canFix: boolean
  pageId?: string
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 ${
        check.pass ? 'border-white/10 bg-white/[0.02]' : 'border-[var(--amber)]/25 bg-[var(--amber)]/[0.04]'
      }`}
    >
      <span className="mt-0.5 shrink-0">
        {check.pass ? <Check className="size-4 text-[var(--ready)]" /> : <MinusCircle className="size-4 text-[var(--amber)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${check.pass ? 'text-zinc-200' : 'text-white'}`}>{check.label}</p>
          {check.relevant && (
            <span className="rounded border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-1.5 py-px text-[9px] uppercase tracking-wide text-[var(--signal)]">
              this query
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">{check.pass ? check.detail : check.fix}</p>
        {!check.pass && canFix && pageId && (
          <a
            href={appUrl(`/dashboard/${pageId}`)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--signal)] hover:underline"
          >
            Fix in editor <ArrowRight className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}
