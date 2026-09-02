'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Interactive Readiness Lab: flip structured signals on/off; each adds its weight to
 * a 0–100 readiness score that drives an animated ring gauge, a verdict, and the list
 * of actions agents can take. Theme-aware (lives on the page surface) - accents use
 * the design tokens so it flips cleanly in light + dark.
 */
type SignalKey = 'offers' | 'actions' | 'schema' | 'mcp' | 'llms' | 'fresh'
type Signal = { key: SignalKey; label: string; weight: number; unlock: string }

const SIGNALS: Signal[] = [
  { key: 'offers', label: 'Offers and prices', weight: 24, unlock: 'compare prices' },
  { key: 'actions', label: 'Ways to buy', weight: 22, unlock: 'book and buy' },
  { key: 'schema', label: 'Business details', weight: 18, unlock: 'understand your business' },
  { key: 'mcp', label: 'Live connection', weight: 14, unlock: 'check what is available' },
  { key: 'llms', label: 'AI guide', weight: 12, unlock: 'read your offers' },
  { key: 'fresh', label: 'Current information', weight: 10, unlock: 'trust your details' },
]

const R = 76
const C = 2 * Math.PI * R // ≈ 477.5

const INITIAL_SIGNALS: Record<SignalKey, boolean> = {
  offers: true,
  actions: true,
  schema: true,
  mcp: false,
  llms: false,
  fresh: false,
}

const DEMO_SIGNAL_STATES: Record<SignalKey, boolean>[] = [
  { offers: true, actions: false, schema: false, mcp: false, llms: false, fresh: false },
  { offers: true, actions: true, schema: false, mcp: false, llms: false, fresh: false },
  { offers: true, actions: true, schema: true, mcp: false, llms: true, fresh: false },
  { offers: true, actions: true, schema: true, mcp: true, llms: true, fresh: true },
  INITIAL_SIGNALS,
]

export function ReadinessLab() {
  const rootRef = useRef<HTMLDivElement>(null)
  const demoIndexRef = useRef(0)
  const [on, setOn] = useState<Record<SignalKey, boolean>>(INITIAL_SIGNALS)
  const [visible, setVisible] = useState(false)
  const [manualControl, setManualControl] = useState(false)

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 0.65] },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || manualControl) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduceMotion.matches) return

    const interval = window.setInterval(() => {
      demoIndexRef.current = (demoIndexRef.current + 1) % DEMO_SIGNAL_STATES.length
      setOn(DEMO_SIGNAL_STATES[demoIndexRef.current])
    }, 1450)

    return () => window.clearInterval(interval)
  }, [visible, manualControl])

  function handleToggle(key: SignalKey) {
    setManualControl(true)
    setOn((p) => ({ ...p, [key]: !p[key] }))
  }

  const score = SIGNALS.reduce((s, f) => s + (on[f.key] ? f.weight : 0), 0)
  const dashOffset = C * (1 - score / 100)
  const verdict =
    score >= 80
      ? { text: 'Ready for buyers', color: 'var(--ready)' }
      : score >= 50
        ? { text: 'Needs a few details', color: 'var(--amber)' }
        : { text: 'Ready to set up', color: 'var(--signal)' }

  return (
    <div ref={rootRef} data-home-readiness-lab className="grid min-w-0 items-stretch gap-5 lg:grid-cols-[1fr_0.85fr]">
      <div className="card min-w-0 !p-5 md:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">What can buyers see?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Turn each item on to see how it helps.</p>
          </div>
          <div className="shrink-0 rounded-lg border border-[var(--signal)]/25 bg-[var(--signal)]/10 px-3 py-2 text-center">
            <span className="block font-display text-2xl font-bold leading-none tabular-nums">{score}</span>
            <span className="mt-1 block font-mono text-[9px] text-muted-foreground">out of 100</span>
          </div>
        </div>
        <div className="nx-home-readiness-grid mt-5 grid grid-cols-2 gap-2">
          {SIGNALS.map((f) => {
            const isOn = !!on[f.key]
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => handleToggle(f.key)}
                aria-pressed={isOn}
                className="flex min-h-[60px] min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left"
                style={{
                  background: isOn ? 'color-mix(in srgb, var(--signal) 12%, transparent)' : 'var(--ov-03)',
                  border: `1px solid ${isOn ? 'color-mix(in srgb, var(--signal) 45%, transparent)' : 'var(--border)'}`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    background: isOn ? 'var(--signal)' : 'var(--ov-10)',
                    color: isOn ? '#fff' : 'var(--fg-muted)',
                  }}
                >
                  {isOn ? '✓' : '+'}
                </span>
                <span className="text-xs font-medium leading-4">{f.label}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-sm font-semibold" style={{ color: verdict.color }}>{verdict.text}</span>
          <span className="text-right text-xs text-muted-foreground">Tap any item to try it</span>
        </div>
      </div>

      {/* toggles */}
      <div className="card hidden !p-6 md:block">
        <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          What you share
        </div>
        <div className="flex flex-col gap-2.5">
          {SIGNALS.map((f) => {
            const isOn = !!on[f.key]
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => handleToggle(f.key)}
                aria-pressed={isOn}
                className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition-colors"
                style={{
                  background: isOn ? 'color-mix(in srgb, var(--signal) 12%, transparent)' : 'var(--ov-03)',
                  border: `1px solid ${isOn ? 'color-mix(in srgb, var(--signal) 45%, transparent)' : 'var(--border)'}`,
                }}
              >
                <span
                  className="relative h-[22px] w-[38px] flex-none rounded-full transition-colors"
                  style={{ background: isOn ? 'var(--signal)' : 'var(--ov-15)' }}
                >
                  <span
                    className="absolute top-[3px] size-4 rounded-full bg-white transition-all"
                    style={{ left: isOn ? 19 : 3 }}
                  />
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold" style={{ color: isOn ? 'var(--fg)' : 'var(--fg-muted)' }}>
                    {f.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground">Helps AI {f.unlock}</span>
                </span>
                <span className="font-mono text-[12px]" style={{ color: isOn ? 'var(--signal)' : 'var(--fg-muted-2)' }}>
                  +{f.weight}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* gauge + verdict */}
      <div
        className="hidden flex-col rounded-[18px] p-6 md:flex"
        style={{
          background: 'color-mix(in srgb, var(--signal) 5%, transparent)',
          border: '1px solid color-mix(in srgb, var(--signal) 22%, transparent)',
        }}
      >
        <div className="relative my-1.5 mb-3.5 flex items-center justify-center">
          <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
            <defs>
              <linearGradient id="nx-lab-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--signal)" />
                <stop offset="100%" stopColor="var(--ready)" />
              </linearGradient>
            </defs>
            <circle cx="90" cy="90" r={R} fill="none" stroke="var(--ov-10)" strokeWidth="13" />
            <circle
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke="url(#nx-lab-grad)"
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={C.toFixed(1)}
              strokeDashoffset={dashOffset.toFixed(1)}
              style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[52px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-white">
              {score}
            </span>
            <span className="mt-1 font-mono text-[11px] text-muted-foreground">ready / 100</span>
          </div>
        </div>
        <div className="mb-4 text-center font-display text-[20px] font-bold tracking-[-0.01em]" style={{ color: verdict.color }}>
          {verdict.text}
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            What AI can do
          </div>
          <div className="flex flex-col gap-2">
            {SIGNALS.map((f) => {
              const isOn = !!on[f.key]
              return (
                <div
                  key={f.key}
                  className="flex items-center gap-2.5 text-[13.5px]"
                  style={{ color: isOn ? 'var(--fg-soft)' : 'var(--fg-muted-2)' }}
                >
                  <span className="font-mono text-[13px]" style={{ color: isOn ? 'var(--ready)' : 'var(--fg-muted-2)' }}>
                    {isOn ? '✓' : '✗'}
                  </span>
                  {isOn ? `Can ${f.unlock}` : `Cannot ${f.unlock} yet`}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
