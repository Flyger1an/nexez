'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, Loader2, Minus, Sparkles, X } from 'lucide-react'
import { appUrl } from '../../lib/site'

type Check = { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }
type ScanResult = {
  ok: true
  url: string
  origin: string
  score: number
  checks: Check[]
  blockedBots: string[]
}
type Comprehension = { score: number; agentRead: string; topFix: string }
type DeepResult = ScanResult & { llmAssisted: boolean; comprehension?: Comprehension; upgradeHint?: string }

function scoreTone(score: number): { color: string; label: string } {
  if (score >= 80) return { color: 'var(--ready)', label: 'Agent-ready' }
  if (score >= 50) return { color: 'var(--amber)', label: 'Partly legible' }
  return { color: '#ef4444', label: 'Hard for agents' }
}

function ScoreRing({ score }: { score: number }) {
  const { color, label } = scoreTone(score)
  const r = 52
  const circ = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width={140} height={140} viewBox="0 0 140 140" aria-hidden="true">
          <circle cx={70} cy={70} r={r} fill="none" stroke="var(--bd-10)" strokeWidth={12} />
          <circle
            cx={70}
            cy={70}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-4xl font-semibold" style={{ color }}>
            {score}
          </span>
          <span className="text-xs text-[var(--fg-muted)]">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

function CheckRow({ c }: { c: Check }) {
  const icon =
    c.status === 'pass' ? (
      <Check className="size-4" style={{ color: 'var(--ready)' }} />
    ) : c.status === 'warn' ? (
      <Minus className="size-4" style={{ color: 'var(--amber)' }} />
    ) : (
      <X className="size-4 text-red-400" />
    )
  return (
    <li className="flex items-start gap-3 border-t border-[var(--bd-10)] py-3 first:border-t-0">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{c.label}</span>
        <span className="block text-xs text-[var(--fg-muted)]">{c.detail}</span>
      </span>
    </li>
  )
}

export function ScanClient() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [deep, setDeep] = useState<DeepResult | null>(null)
  const [deepLoading, setDeepLoading] = useState(false)
  const [deepMsg, setDeepMsg] = useState('')
  const [needsAuth, setNeedsAuth] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = url.trim()
    if (!value || loading) return
    setLoading(true)
    setError('')
    setResult(null)
    setDeep(null)
    setDeepMsg('')
    setNeedsAuth(false)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Could not scan that URL. Try another.')
        return
      }
      setResult(data as ScanResult)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Deep (LLM) pass: same-origin, authed via the shared session cookie. A 401
  // means "not signed in" (the auth gate); the deterministic result stays shown.
  async function runDeep() {
    if (!result || deepLoading) return
    setDeepLoading(true)
    setDeepMsg('')
    setNeedsAuth(false)
    try {
      const res = await fetch('/api/scan/deep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: result.url }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setNeedsAuth(true)
        return
      }
      if (!res.ok) {
        setDeepMsg(data?.error || 'Could not run the deep analysis.')
        return
      }
      setDeep(data as DeepResult)
      if (data?.upgradeHint) setDeepMsg(data.upgradeHint)
    } catch {
      setDeepMsg('Network error — please try again.')
    } finally {
      setDeepLoading(false)
    }
  }

  const shown: ScanResult | DeepResult | null = deep ?? result
  const comprehension = deep?.comprehension
  const deepHref = result
    ? appUrl(`/onboard?next=${encodeURIComponent(`/create?url=${encodeURIComponent(result.url)}`)}`)
    : appUrl('/onboard')

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-24">
      <div className="text-center">
        <p className="eyebrow" style={{ color: 'var(--signal)' }}>
          Free · no signup · no AI cost
        </p>
        <h1 className="display mt-4 text-balance">Is your website legible to AI agents?</h1>
        <p className="lede mx-auto mt-4 max-w-xl">
          AI shopping agents read structured data, not your design. Scan any site to see what they can — and can’t — parse,
          then make your offers agent-transactable with Nexez.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourwebsite.com"
          aria-label="Website URL to scan"
          disabled={loading}
          className="min-h-[52px] flex-1 rounded-[16px] border border-[var(--bd-10)] bg-[var(--ov-03)] px-4 text-base outline-none transition focus:border-[var(--signal)]"
        />
        <button type="submit" disabled={loading || !url.trim()} className="btn-primary min-h-[52px] px-6 disabled:opacity-60">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? 'Scanning…' : 'Scan my site'}
          {!loading ? <ArrowRight className="size-4" /> : null}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mx-auto mt-4 max-w-xl text-center text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {shown ? (
        <section className="glass mt-10 rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
            <ScoreRing score={shown.score} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--fg-muted)]">Scanned</p>
              <p className="truncate text-lg font-semibold">{shown.origin}</p>
              <p className="mt-2 text-sm text-[var(--fg-muted)]">
                {deep?.llmAssisted
                  ? 'Structural checks + AI comprehension of your offers.'
                  : '7 deterministic checks across structured data, agent manifests, and crawler access.'}
              </p>
              {shown.blockedBots.length > 0 ? (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {shown.blockedBots.map((b) => (
                    <span key={b} className="chip text-xs" style={{ color: 'var(--amber)' }}>
                      {b} blocked
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <ul className="mt-8">
            {shown.checks.map((c) => (
              <CheckRow key={c.id} c={c} />
            ))}
          </ul>

          {/* Agent's-eye read (the LLM comprehension layer). */}
          {comprehension ? (
            <div className="mt-6 rounded-[18px] border border-[var(--bd-10)] bg-[var(--ov-03)] p-5">
              <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--signal)' }}>
                <Sparkles className="size-4" /> Agent’s-eye read
                <span className="font-mono text-xs font-normal text-[var(--fg-muted)]">
                  comprehension {comprehension.score}/100
                </span>
              </p>
              <p className="mt-2 text-sm leading-6">{comprehension.agentRead}</p>
              {comprehension.topFix ? (
                <p className="mt-3 text-sm">
                  <span className="font-semibold" style={{ color: 'var(--ready)' }}>
                    Top fix:{' '}
                  </span>
                  {comprehension.topFix}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-start gap-2">
              <button
                type="button"
                onClick={runDeep}
                disabled={deepLoading}
                className="btn-secondary min-h-[44px] px-4 disabled:opacity-60"
              >
                {deepLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {deepLoading ? 'Reading as an agent…' : 'Add AI comprehension analysis'}
              </button>
              {needsAuth ? (
                <p className="text-xs text-[var(--fg-muted)]">
                  <a href={deepHref} className="underline decoration-white/25 underline-offset-4 hover:decoration-white">
                    Sign in
                  </a>{' '}
                  to see how an AI agent understands your offers (sends this page’s text to the model).
                </p>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">
                  Signed in? Grade how well an AI agent understands your offers — sends this page’s text to the model.
                </p>
              )}
              {deepMsg ? <p className="text-xs" style={{ color: 'var(--amber)' }}>{deepMsg}</p> : null}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={deepHref} className="btn-primary min-h-[48px] flex-1 justify-center px-5">
              Get the full report + your offers extracted <ArrowRight className="size-4" />
            </a>
            <a href={appUrl('/onboard')} className="btn-secondary min-h-[48px] justify-center px-5">
              Fix this with Nexez
            </a>
          </div>
          <p className="mt-3 text-center text-xs text-[var(--fg-muted)]">
            The free scan stores nothing and summarizes only the score. AI comprehension sends the page text to the model.
          </p>
        </section>
      ) : null}

      {!result && !loading ? (
        <p className="mt-10 text-center text-xs text-[var(--fg-muted)]">
          Try your homepage, a product page, or a competitor’s site.
        </p>
      ) : null}
    </main>
  )
}
