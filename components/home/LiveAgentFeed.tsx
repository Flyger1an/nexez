'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Live agent activity: a session log that streams a scripted agent→parse→query→match
 * →book→pay→attribute cycle (a new row every 1.4s, keeping the last 7), beside an
 * attribution column. The agent name rotates each full cycle. Theme-aware surfaces.
 */
type Role = 'agent' | 'sys' | 'ok' | 'pay'
type Row = { id: number; role: Role; label: string; msg: string }

const AGENTS = ['ChatGPT', 'Claude', 'Perplexity', 'Grok']

const STEPS: { role: Role; label: (a: string) => string; msg: (a: string) => string }[] = [
  { role: 'agent', label: (a) => a, msg: (a) => `GET nexez.app/your-store · via ${a}` },
  { role: 'sys', label: () => 'parse', msg: () => 'agent.json ok · 5 offers · readiness 96' },
  { role: 'agent', label: (a) => a, msg: () => 'query: "deep tissue, sat, under $150"' },
  { role: 'ok', label: () => 'match', msg: () => 'Deep Tissue 60m · $120 · book available' },
  { role: 'agent', label: (a) => a, msg: () => 'action: book → Sat 14:00' },
  { role: 'pay', label: () => 'stripe', msg: () => 'checkout captured · $120' },
  { role: 'sys', label: () => 'log', msg: (a) => `attributed to ${a} · logged` },
]

// The log is a fixed dark "terminal" surface (like the X-Ray agent layer), so text
// colors are fixed light-on-dark rather than theme tokens. Tags still use the brand
// accents (periwinkle for the agent, teal for match/checkout) so they pop.
const ROLE_STYLE: Record<Role, { tagBg: string; tagFg: string; msg: string }> = {
  agent: { tagBg: 'color-mix(in srgb, var(--signal) 22%, transparent)', tagFg: 'var(--signal)', msg: '#D8D8D2' },
  sys: { tagBg: 'rgba(255,255,255,0.07)', tagFg: '#8A8A82', msg: '#8A8A82' },
  ok: { tagBg: 'color-mix(in srgb, var(--ready) 26%, transparent)', tagFg: 'var(--ready)', msg: 'var(--ready)' },
  pay: { tagBg: 'color-mix(in srgb, var(--ready) 22%, transparent)', tagFg: 'var(--ready)', msg: '#F4F4F1' },
}

const MODELS = [
  { name: 'ChatGPT', pct: 44 },
  { name: 'Claude', pct: 28 },
  { name: 'Perplexity', pct: 19 },
  { name: 'Grok', pct: 9 },
]

export function LiveAgentFeed() {
  const [feed, setFeed] = useState<Row[]>([])
  const rowIdRef = useRef(0)

  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches) return

    let i = 0
    const tick = () => {
      const step = STEPS[i % STEPS.length]
      const agent = AGENTS[Math.floor(i / STEPS.length) % AGENTS.length]
      const row: Row = { id: rowIdRef.current++, role: step.role, label: step.label(agent), msg: step.msg(agent) }
      i += 1
      setFeed((prev) => [...prev, row].slice(-7))
    }
    tick() // seed one immediately so the panel isn't empty
    const timer = setInterval(tick, 1400)
    return () => clearInterval(timer)
  }, [])

  return (
    <>
      <div className="grid gap-3 md:hidden">
        <div
          className="overflow-hidden rounded-2xl border border-border bg-[#0B0B0D] p-5"
          style={{ color: '#F4F4F1' }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-[var(--signal)]">Example buyer visit</span>
            <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-zinc-400">Live view</span>
          </div>
          <p className="mt-5 text-lg font-medium leading-7">
            “Deep tissue massage this Saturday for under $150.”
          </p>
          <div className="mt-5 rounded-xl border border-[var(--ready)]/20 bg-[var(--ready)]/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ready)]">Offer found</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Deep Tissue, 60 minutes</p>
                <p className="mt-1 text-xs text-zinc-400">Saturday at 2:00 PM</p>
              </div>
              <span className="text-lg font-semibold text-[var(--ready)]">$120</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card !p-4">
            <p className="text-xs text-muted-foreground">Buyer visits</p>
            <p className="mt-2 font-display text-2xl font-bold">312</p>
          </div>
          <div className="card !p-4">
            <p className="text-xs text-muted-foreground">Sales started</p>
            <p className="mt-2 font-display text-2xl font-bold">$48.2k</p>
          </div>
        </div>
      </div>

      <div className="hidden gap-5 md:grid lg:grid-cols-[1.5fr_1fr]">
      {/* session log - fixed dark terminal surface */}
      <div className="overflow-hidden rounded-2xl" style={{ background: '#0B0B0D', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--signal)]">
            <span className="nx-pulsedot size-1.5 rounded-full" style={{ background: 'var(--signal)' }} />
            agent_session · live
          </span>
          <span className="font-mono text-[11px]" style={{ color: '#65655F' }}>nexez.app/your-store</span>
        </div>
        <div className="flex min-h-[300px] flex-col gap-2.5 px-4 py-4 sm:px-5">
          {feed.map((r) => {
            const s = ROLE_STYLE[r.role]
            return (
              <div key={r.id} className="nx-log-row flex items-start gap-3">
                <span
                  className="w-16 flex-none rounded-md py-1 text-center font-mono text-[10px] uppercase tracking-[0.06em]"
                  style={{ background: s.tagBg, color: s.tagFg }}
                >
                  {r.label}
                </span>
                <span className="font-mono text-[13px] leading-[1.5]" style={{ color: s.msg }}>
                  {r.msg}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* attribution */}
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3.5">
          {[
            { label: 'Conversions · 30d', value: '312', delta: '+9.1%' },
            { label: 'Pipeline · 30d', value: '$48.2k', delta: '+$7.3k' },
          ].map((k) => (
            <div key={k.label} className="card !p-[18px]">
              <div className="mb-2 text-[12.5px] text-muted-foreground">{k.label}</div>
              <div className="font-display text-[30px] font-bold tracking-[-0.02em]">{k.value}</div>
              <div className="mt-1 font-mono text-[11.5px] text-[var(--ready)]">{k.delta}</div>
            </div>
          ))}
        </div>
        <div className="card flex-1 !p-5">
          <div className="mb-[18px] text-[13px] font-semibold text-white">Conversions by agent</div>
          <div className="flex flex-col gap-3.5">
            {MODELS.map((m) => (
              <div key={m.name}>
                <div className="mb-1.5 flex justify-between text-[12.5px]">
                  <span className="text-white/80">{m.name}</span>
                  <span className="font-mono text-muted-foreground">{m.pct}%</span>
                </div>
                <div className="h-[7px] overflow-hidden rounded" style={{ background: 'var(--ov-06)' }}>
                  <div className="nx-bar h-full rounded" style={{ width: `${m.pct}%`, background: 'var(--signal)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
