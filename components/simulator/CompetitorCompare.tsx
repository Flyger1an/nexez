'use client'

import React, { useState } from 'react'
import { Download, ExternalLink, Loader2, Lock, Target } from 'lucide-react'
import type { AgentPage } from '../../lib/agent-page'
import { appUrl } from '../../lib/site'

/**
 * "Compare a competitor" - the signed-in lens of the Agent Lab. Scores any rival
 * site for agent-readiness (trust / parseability / structured-data / clarity),
 * surfaces gaps + recommendations, and (optionally) puts it side-by-side with one
 * of the owner's own pages. Backed by /api/analyze-competitor (auth + LLM, so it
 * stays behind sign-in). Logged-out visitors see a locked teaser - a natural
 * conversion nudge.
 */

type CompetitorAnalysis = {
  url: string
  analyzedAt: string
  scores: { overall: number; parseability: number; structuredDataQuality: number; clarityAndIntent: number }
  missing: string[]
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  provenance: {
    analysis: 'deterministic' | 'deterministic_with_llm'
    cache: { hit: boolean; scope: 'process'; ttlHours: 48 }
    fetch: 'respectful_public_web'
  }
  userComparison?: {
    slug: string
    name?: string
    readiness?: number
    trust?: number
    offerCount?: number
    summary: string
    winSuggestions: string[]
  }
}

function scoreTone(v: number | undefined) {
  if (v == null) return 'text-zinc-500'
  return v >= 80 ? 'text-[var(--ready)]' : v >= 55 ? 'text-[var(--amber)]' : 'text-rose-400'
}

export function CompetitorCompare({ isLoggedIn, myPages }: { isLoggedIn: boolean; myPages: AgentPage[] }) {
  const [url, setUrl] = useState('')
  const [sideSlug, setSideSlug] = useState('')
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  if (!isLoggedIn) {
    return (
      <div className="card flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10">
          <Lock className="size-5 text-[var(--signal)]" />
        </div>
        <h3 className="text-xl font-semibold">Compare a competitor</h3>
        <p className="max-w-md text-sm text-zinc-400">
          Score any rival site for agent-readiness - trust, parseability, structured data, and clarity - see exactly
          what it&apos;s missing, and put it side-by-side with your own listing. Sign in to unlock.
        </p>
        <div className="mt-1 flex gap-2">
          <a href={appUrl('/login')} className="btn-secondary text-sm">Sign in</a>
          <a href={appUrl('/create')} className="btn-primary text-sm">Get started</a>
        </div>
      </div>
    )
  }

  async function run() {
    if (!url.trim()) return
    setLoading(true)
    setAnalysis(null)
    setMarkdown('')
    setMessage('')
    try {
      const body: { url: string; userPageSlug?: string; pageId?: string } = { url: url.trim() }
      if (sideSlug.trim()) {
        body.userPageSlug = sideSlug.trim()
        // Attribute the AI gate to the compared page's owner (lets an editor run it on
        // the owner's plan); the page-less lens self-gates on the caller.
        const matched = myPages.find((p) => p.slug === sideSlug.trim())
        if (matched?.id) body.pageId = matched.id
      }
      const res = await fetch('/api/analyze-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessage(data.error || 'Analysis failed. Make sure the URL is a public site and try again.')
        return
      }
      setAnalysis(data.analysis as CompetitorAnalysis)
      setMarkdown(typeof data.markdown === 'string' ? data.markdown : '')
      setMessage(data.analysis?.provenance?.cache?.hit ? 'Analysis loaded from this server process cache.' : 'Fresh analysis complete.')
    } catch (e) {
      setMessage('Request error: ' + (e instanceof Error ? e.message : 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  function exportReport(format: 'md' | 'json') {
    if (!analysis) return
    const content = format === 'md' ? markdown || analysisToMd(analysis) : JSON.stringify(analysis, null, 2)
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `competitor-analysis-${analysis.url.replace(/https?:\/\//, '').replace(/[^\w.-]/g, '_')}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(href)
  }

  const scoreCards = [
    { label: 'Overall agent trust', val: analysis?.scores?.overall },
    { label: 'Parseability', val: analysis?.scores?.parseability },
    { label: 'Structured data', val: analysis?.scores?.structuredDataQuality },
    { label: 'Clarity & intent', val: analysis?.scores?.clarityAndIntent },
  ]

  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        <Target className="size-4 text-[var(--ready)]" />
        <span className="font-medium">Compare a competitor</span>
        <span className="rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--signal)]">Signed in</span>
      </div>
      <p className="mb-4 text-sm text-zinc-400">Score any rival site for agent-readiness, see its gaps, and put it head-to-head with your listing.</p>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-3">
          <label className="text-xs text-zinc-400">Competitor website URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading && url.trim()) run() }}
            placeholder="https://competitor.com or competitor.com/pricing"
            className="input mt-1 w-full"
            disabled={loading}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-zinc-400">Your listing (optional side-by-side)</label>
          {myPages.length > 0 ? (
            <select value={sideSlug} onChange={(e) => setSideSlug(e.target.value)} className="input mt-1 w-full" disabled={loading}>
              <option value="">- none -</option>
              {myPages.map((p) => (
                <option key={p.id} value={p.slug}>{p.name} (/{p.slug})</option>
              ))}
            </select>
          ) : (
            <input value={sideSlug} onChange={(e) => setSideSlug(e.target.value)} placeholder="your-slug" className="input mt-1 w-full" disabled={loading} />
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={run} disabled={loading || !url.trim()} className="btn-primary flex-1 justify-center">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />} Analyze competitor
        </button>
        {analysis && (
          <>
            <button onClick={() => exportReport('md')} className="btn-secondary inline-flex items-center gap-1"><Download className="size-4" /> MD</button>
            <button onClick={() => exportReport('json')} className="btn-secondary inline-flex items-center gap-1"><Download className="size-4" /> JSON</button>
          </>
        )}
      </div>
      {message && <p className="mt-2 text-xs text-[var(--ready)]">{message}</p>}

      {analysis && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="mb-4 text-sm text-zinc-400">
            Analysis for{' '}
            <a href={analysis.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-200 underline">
              {analysis.url} <ExternalLink className="size-3" />
            </a>
          </p>

          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            <ProvenanceItem label="Method" value={analysis.provenance.analysis === 'deterministic_with_llm' ? 'Rules + LLM refinement' : 'Deterministic rules'} />
            <ProvenanceItem label="Source" value="Public web fetch" />
            <ProvenanceItem
              label="Cache"
              value={analysis.provenance.cache.hit ? 'Process-cache hit' : 'Fresh fetch'}
            />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {scoreCards.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-[#12101B] p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">{s.label}</div>
                <div className={`mt-1 text-3xl font-semibold tabular-nums ${scoreTone(s.val)}`}>{s.val ?? '-'}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-white/10">
                  <div className={`h-1.5 ${scoreTone(s.val)} bg-current`} style={{ width: `${Math.min(100, s.val || 0)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 text-sm md:grid-cols-2">
            <GapList title="Missing for agents" tone="text-rose-300" items={analysis.missing} />
            <GapList title="Strengths" tone="text-[var(--ready)]" items={analysis.strengths} />
            <GapList title="Weaknesses" tone="text-[var(--amber)]" items={analysis.weaknesses} />
            <GapList title="Recommendations" tone="text-[var(--signal)]" items={analysis.recommendations} />
          </div>

          {analysis.userComparison && (
            <div className="mt-4 rounded-2xl border border-[var(--ready)]/25 bg-[var(--ready)]/[0.04] p-4">
              <p className="font-medium">Head-to-head vs your listing (/{analysis.userComparison.slug})</p>
              <p className="mt-1 text-sm text-zinc-300">
                Your readiness <span className="font-mono text-[var(--ready)]">{analysis.userComparison.readiness ?? '-'}</span> · trust{' '}
                <span className="font-mono text-[var(--ready)]">{analysis.userComparison.trust ?? '-'}</span> · {analysis.userComparison.offerCount ?? 0} offers
              </p>
              {analysis.userComparison.summary && <p className="mt-1 text-xs text-zinc-400">{analysis.userComparison.summary}</p>}
              {analysis.userComparison.winSuggestions?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {analysis.userComparison.winSuggestions.map((w, i) => (
                    <li key={i} className="text-xs text-zinc-300">→ {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-3 text-[10px] text-zinc-500">
            Respects robots.txt · up to 48h best-effort cache within one running server process · exportable.
          </p>
        </div>
      )}
    </div>
  )
}

function ProvenanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-xs font-medium text-zinc-200">{value}</p>
    </div>
  )
}

function GapList({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className={`mb-2 font-medium ${tone}`}>{title}</div>
      {items?.length ? (
        <ul className="space-y-1 text-xs text-zinc-400">
          {items.map((it, i) => (
            <li key={i}>• {it}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-600">-</p>
      )}
    </div>
  )
}

function analysisToMd(a: CompetitorAnalysis): string {
  return [
    `# Agent-readiness analysis - ${a.url}`,
    ``,
    `Overall: ${a.scores.overall} · Parseability: ${a.scores.parseability} · Structured data: ${a.scores.structuredDataQuality} · Clarity: ${a.scores.clarityAndIntent}`,
    ``,
    `## Missing`,
    ...a.missing.map((m) => `- ${m}`),
    ``,
    `## Recommendations`,
    ...a.recommendations.map((r) => `- ${r}`),
  ].join('\n')
}
