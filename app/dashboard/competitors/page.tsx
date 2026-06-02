'use client'

import React, { useState } from 'react'
import { ArrowLeft, BarChart3, Download, ExternalLink, Loader2, Target } from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import { AgentPage, getReadinessScore, getTrustScore } from '../../../lib/agent-page'
import { optimizeAllOffersForAgents } from '../../../lib/ai-optimize'
import { runMultiAgentSimulation } from '../../../lib/agent-simulator'
import { createClient } from '../../../utils/supabase/client'

export default function CompetitorIntelligence() {
  const [yourSlug, setYourSlug] = useState('')
  const [competitorSlugs, setCompetitorSlugs] = useState<string[]>([''])
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // NEW: Competitor Website Analyzer (any URL, high-prio per Tier 2 spec)
  const [extUrl, setExtUrl] = useState('')
  const [sideSlug, setSideSlug] = useState('')
  const [extAnalysis, setExtAnalysis] = useState<any>(null)
  const [extLoading, setExtLoading] = useState(false)
  const [extMessage, setExtMessage] = useState('')

  async function runAnalysis() {
    setLoading(true)
    setAnalysis(null)

    const supabase = createClient()

    try {
      // Real fetching + public-simulate for deeper analysis
      const yourRes = await fetch(`/api/public-simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: yourSlug, query: 'Analyze this page for competitors' }),
      }).catch(() => null)
      const yourSimData = yourRes && yourRes.ok ? await yourRes.json() : null

      const yourBase = { name: yourSlug || 'Your Page', slug: yourSlug, description: 'Your optimized page', services: [], products: [], faqs: [], is_published: true } as any
      const yourSim = yourSimData || runMultiAgentSimulation(yourBase, 'Analyze offers')

      const comps: any[] = []
      for (const slug of competitorSlugs.filter(Boolean)) {
        const compRes = await fetch(`/api/public-simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, query: 'Compare to competitor' }),
        }).catch(() => null)
        const compData = compRes && compRes.ok ? await compRes.json() : null
        const cBase = { name: slug, slug, description: 'Competitor page', services: [], products: [], faqs: [], is_published: true } as any
        comps.push({
          slug,
          sim: compData || runMultiAgentSimulation(cBase, 'Analyze offers'),
          readiness: getReadinessScore(cBase),
          trust: getTrustScore(cBase),
          page: cBase,
        })
      }

      // Simple AI comparison using optimize (for gaps)
      const yourOpt = optimizeAllOffersForAgents('', '', { businessName: yourSlug, audience: 'buyers' })
      const gaps = comps.map(c => `Competitor ${c.slug} may have edge in ${c.readiness > 70 ? 'readiness' : 'basic structure'}. Suggestion: ${yourOpt.services ? 'add more tiers' : 'enhance descriptions'}`)

      setAnalysis({
        your: { readiness: getReadinessScore(yourBase), trust: getTrustScore(yourBase), sim: yourSim, page: yourBase },
        competitors: comps,
        gaps,
        pricingComparison: 'Your base pricing vs competitors: consider tiering for better agent conversion (see Co-Pilot).',
      })
    } catch (e) {
      setAnalysis({ error: 'Analysis failed. Ensure slugs are public/published or try demo.' })
    } finally {
      setLoading(false)
    }
  }

  // NEW Analyzer (any external site) — early Tier 2 high-value intelligence feature
  async function runExternalAnalysis() {
    if (!extUrl.trim()) return
    setExtLoading(true)
    setExtAnalysis(null)
    setExtMessage('')

    try {
      const body: any = { url: extUrl.trim() }
      if (sideSlug.trim()) body.userPageSlug = sideSlug.trim()

      const res = await fetch('/api/analyze-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setExtMessage('Analysis failed: ' + (data.error || 'unknown'))
      } else {
        setExtAnalysis(data.analysis)
        setExtMessage('Analysis complete. Cached 48h. Export below for sharing.')
      }
    } catch (e: any) {
      setExtMessage('Request error: ' + (e.message || e))
    } finally {
      setExtLoading(false)
    }
  }

  function exportExt(format: 'md' | 'json') {
    if (!extAnalysis) return
    const content = format === 'md' ? (extAnalysis._markdown || '') : JSON.stringify(extAnalysis, null, 2)
    // If server didn't attach, reconstruct lightweight
    const final = content || (format === 'md' ?
      `# Agent Analysis for ${extAnalysis.url}\n\nOverall: ${extAnalysis.scores?.overall}\n\n` + (extAnalysis.recommendations || []).join('\n') :
      JSON.stringify(extAnalysis, null, 2))

    const blob = new Blob([final], { type: format === 'json' ? 'application/json' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `competitor-analysis-${(extAnalysis.url || 'site').replace(/https?:\/\//,'').replace(/\//g,'_')}.${format}`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <ErrorBoundary>
        <div className="mx-auto max-w-5xl px-6 py-8">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" /> Dashboard
          </a>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="size-8 text-[#7C3AED]" /> AI Competitor Intelligence
          </h1>
          <p className="mt-2 text-[#9CA3AF]">Strategic intel on how AI agents perceive competitors — and how you stack up. <span className="text-[#10B981]">New: Analyze any website (not just Nexez pages) — high priority intelligence layer.</span> Use below for deep Nexez-page benchmarking (readiness/trust/gaps via simulator + optimizer).</p>

          {/* NEW: Competitor Website Analyzer (High Priority — any external URL, per Tier 2 spec) */}
          <div className="mt-8 card border-[#7C3AED]/40">
            <div className="flex items-center gap-2 mb-2">
              <Target className="size-5 text-[#10B981]" />
              <span className="font-semibold text-lg">Competitor Website Analyzer</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">NEW — High Value</span>
            </div>
            <p className="text-sm text-[#9CA3AF] mb-4">Paste any competitor website URL. Get Overall Agent Trust Score (0–100), Parseability, Structured Data Quality (JSON-LD/llms.txt/schema), Clarity & Intent, Missing Info, Strengths/Weaknesses, and Actionable Recommendations. Optional side-by-side with your Nexez page. 48h cache. Exportable.</p>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-3">
                <label className="text-xs text-zinc-400">Competitor website URL (any public site)</label>
                <input value={extUrl} onChange={e => setExtUrl(e.target.value)} placeholder="https://competitor.com or competitor.com/pricing" className="input w-full mt-1" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-400">Your Nexez slug (for side-by-side, optional)</label>
                <input value={sideSlug} onChange={e => setSideSlug(e.target.value)} placeholder="your-offers" className="input w-full mt-1" />
              </div>
            </div>

            <div className="flex gap-3 mt-3">
              <button onClick={runExternalAnalysis} disabled={extLoading || !extUrl.trim()} className="btn-primary flex-1">
                {extLoading ? <Loader2 className="animate-spin size-4 inline" /> : 'Analyze Competitor Site'}
              </button>
              {extAnalysis && (
                <>
                  <button onClick={() => exportExt('md')} className="btn-secondary inline-flex items-center gap-1"><Download className="size-4" /> MD</button>
                  <button onClick={() => exportExt('json')} className="btn-secondary inline-flex items-center gap-1"><Download className="size-4" /> JSON</button>
                </>
              )}
            </div>
            {extMessage && <p className="mt-2 text-xs text-emerald-300">{extMessage}</p>}

            {extAnalysis && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="text-sm mb-3">Analysis for <a href={extAnalysis.url} target="_blank" className="underline inline-flex items-center gap-1">{extAnalysis.url} <ExternalLink className="size-3" /></a> • {new Date(extAnalysis.analyzedAt).toLocaleString()}</div>

                {/* Visual scores per spec */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Overall Agent Trust', val: extAnalysis.scores?.overall, color: 'emerald' },
                    { label: 'Parseability', val: extAnalysis.scores?.parseability, color: 'cyan' },
                    { label: 'Structured Data Quality', val: extAnalysis.scores?.structuredDataQuality, color: 'violet' },
                    { label: 'Clarity & Intent', val: extAnalysis.scores?.clarityAndIntent, color: 'amber' },
                  ].map((s, i) => (
                    <div key={i} className="rounded-lg bg-[#12101B] border border-white/10 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-400">{s.label}</div>
                      <div className={`text-3xl font-semibold mt-1 ${s.val >= 80 ? 'text-emerald-400' : s.val >= 55 ? 'text-amber-400' : 'text-rose-400'}`}>{s.val ?? '—'}</div>
                      <div className="h-1.5 bg-white/10 rounded mt-2 overflow-hidden"><div className="h-1.5 bg-current" style={{ width: `${Math.min(100, s.val || 0)}%` }} /></div>
                    </div>
                  ))}
                </div>

                {/* Missing / Strengths / Weak / Recs */}
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="card bg-black/30">
                    <div className="font-medium mb-2 text-rose-300">Missing Information</div>
                    <ul className="space-y-1 text-xs text-[#9CA3AF]">{(extAnalysis.missing || []).map((m: string, i: number) => <li key={i}>• {m}</li>)}</ul>
                  </div>
                  <div className="card bg-black/30">
                    <div className="font-medium mb-2 text-emerald-300">Strengths</div>
                    <ul className="space-y-1 text-xs text-[#9CA3AF]">{(extAnalysis.strengths || []).map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
                  </div>
                  <div className="card bg-black/30">
                    <div className="font-medium mb-2 text-amber-300">Weaknesses</div>
                    <ul className="space-y-1 text-xs text-[#9CA3AF]">{(extAnalysis.weaknesses || []).map((w: string, i: number) => <li key={i}>• {w}</li>)}</ul>
                  </div>
                  <div className="card bg-black/30">
                    <div className="font-medium mb-2 text-[#C4B5FD]">Actionable Recommendations</div>
                    <ul className="space-y-1 text-xs text-[#9CA3AF]">{(extAnalysis.recommendations || []).map((r: string, i: number) => <li key={i}>• {r}</li>)}</ul>
                  </div>
                </div>

                {/* Side-by-side (optional) */}
                {extAnalysis.userComparison && (
                  <div className="mt-4 card border-[#10B981]/30">
                    <div className="font-semibold mb-1">Side-by-Side vs Your Nexez Page (/{extAnalysis.userComparison.slug})</div>
                    <div className="text-sm">Your Readiness: <span className="font-mono">{extAnalysis.userComparison.readiness}</span> • Trust: <span className="font-mono">{extAnalysis.userComparison.trust}</span> • Offers: {extAnalysis.userComparison.offerCount}</div>
                    <div className="text-xs mt-1 text-zinc-400">{extAnalysis.userComparison.summary}</div>
                    <div className="mt-2 text-xs">Win suggestions: {extAnalysis.userComparison.winSuggestions?.join(' ')}</div>
                  </div>
                )}

                <div className="mt-3 text-[10px] text-zinc-500">Data captured here improves Nexez scoring models (flywheel). Results cached ~48h. Export MD/JSON above for prompts, reports, or sharing.</div>
              </div>
            )}
          </div>

          {/* Existing Nexez-page only competitor intel (kept for continuity) */}
          <div className="mt-10">
            <div className="text-sm uppercase tracking-[2px] text-zinc-500 mb-2">Nexez Pages Only (Legacy Comparison)</div>
            <div className="card">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm">Your page slug</label>
                  <input value={yourSlug} onChange={e=>setYourSlug(e.target.value)} placeholder="my-offers" className="input w-full mt-1" />
                </div>
                <div>
                  <label className="text-sm">Competitor slugs (add more)</label>
                  {competitorSlugs.map((s, i) => (
                    <input key={i} value={s} onChange={e => {
                      const next = [...competitorSlugs]; next[i] = e.target.value; setCompetitorSlugs(next)
                    }} placeholder="competitor-slug" className="input w-full mt-1" />
                  ))}
                  <button onClick={() => setCompetitorSlugs([...competitorSlugs, ''])} className="text-xs mt-1 text-cyan-400">+ Add competitor</button>
                </div>
              </div>
              <button onClick={runAnalysis} disabled={loading} className="btn-primary mt-4 w-full">
                {loading ? <Loader2 className="animate-spin size-4" /> : 'Run AI Competitor Analysis (Nexez pages)'}
              </button>
            </div>
          </div>

          {analysis && (
            <div className="mt-8 grid gap-6">
              <div className="card">
                <h3 className="font-semibold">Your Page</h3>
                <div>Readiness: {analysis.your.readiness} • Trust: {analysis.your.trust}</div>
                <pre className="text-xs mt-2 bg-black/40 p-2 overflow-auto">{JSON.stringify(analysis.your.sim.results[0]?.schema?.page, null, 2)}</pre>
              </div>

              <div className="card">
                <h3 className="font-semibold">Competitors</h3>
                {analysis.competitors.map((c: any, i: number) => (
                  <div key={i} className="mt-2 border-t pt-2">
                    <div>{c.slug} — Readiness {c.readiness} • Trust {c.trust}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3 className="font-semibold">Gaps & Opportunities (AI)</h3>
                <ul className="text-sm mt-2 space-y-1">
                  {analysis.gaps.map((g: string, i: number) => <li key={i}>• {g}</li>)}
                </ul>
                <div className="mt-2 text-xs text-zinc-400">{analysis.pricingComparison}</div>
              </div>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </main>
  )
}
