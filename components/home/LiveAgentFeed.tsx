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
  { role: 'agent', label: (a) => a, msg: (a) => `GET nexez.app/nexez-spa · via ${a}` },
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
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      {/* session log — fixed dark terminal surface */}
      <div className="overflow-hidden rounded-2xl" style={{ background: '#0B0B0D', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--signal)]">
            <span className="nx-pulsedot size-1.5 rounded-full" style={{ background: 'var(--signal)' }} />
            agent_session · live
          </span>
          <span className="font-mono text-[11px]" style={{ color: '#65655F' }}>nexez.app/nexez-spa</span>
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
  )
}
