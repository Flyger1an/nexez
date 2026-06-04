'use client'

import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'

type View = 'both' | 'human' | 'agent'

const TABS: { id: View; label: string }[] = [
  { id: 'both', label: 'Compare' },
  { id: 'human', label: 'Human site' },
  { id: 'agent', label: 'Agent page' },
]

// The signature split: a cluttered human site vs the precise agent surface,
// with a before/after toggle to focus either side.
export function PhilosophySplit() {
  const [view, setView] = useState<View>('both')

  const humanCls =
    view === 'agent'
      ? 'opacity-30 hidden lg:block'
      : view === 'human'
        ? 'ring-1 ring-cyan-400/25'
        : ''
  const agentCls =
    view === 'human'
      ? 'opacity-30 hidden lg:block'
      : view === 'agent'
        ? 'ring-1 ring-cyan-400/25'
        : ''

  return (
    <div>
      <div className="mb-7 flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-white/[0.03] p-0.5 text-xs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              aria-pressed={view === t.id}
              className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${
                view === t.id ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* Human site */}
        <div className={`nx-tile p-4 transition-all duration-300 ${humanCls}`}>
          <p className="mb-3 px-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">What humans see</p>
          <div className="overflow-hidden rounded-lg border border-border bg-[#0c0c12]">
            {/* browser chrome */}
            <div className="flex items-center gap-1.5 border-b border-border bg-white/[0.04] px-3 py-2">
              <span className="size-2 rounded-full bg-white/30" />
              <span className="size-2 rounded-full bg-white/30" />
              <span className="size-2 rounded-full bg-white/30" />
              <span className="ml-2 h-2.5 w-28 rounded-full bg-white/[0.12]" />
            </div>
            <div className="space-y-3.5 p-4">
              {/* nav */}
              <div className="flex items-center gap-2">
                <span className="h-3 w-12 rounded bg-white/25" />
                <span className="ml-auto h-2 w-9 rounded-full bg-white/15" />
                <span className="h-2 w-9 rounded-full bg-white/15" />
                <span className="h-2 w-9 rounded-full bg-white/15" />
                <span className="h-5 w-12 rounded bg-white/20" />
              </div>
              {/* hero */}
              <div className="rounded-md bg-gradient-to-br from-violet-500/30 via-white/[0.06] to-cyan-500/20 p-4">
                <span className="block h-3 w-2/3 rounded-full bg-white/35" />
                <span className="mt-2 block h-2 w-1/2 rounded-full bg-white/20" />
                <div className="mt-3 flex gap-2">
                  <span className="h-6 w-20 rounded bg-white/30" />
                  <span className="h-6 w-16 rounded border border-white/20 bg-white/5" />
                </div>
              </div>
              {/* content cards */}
              <div className="grid grid-cols-3 gap-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded border border-white/10 bg-white/[0.05] p-2">
                    <span className="block h-8 rounded bg-white/10" />
                    <span className="mt-1.5 block h-1.5 w-full rounded-full bg-white/15" />
                    <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-white/10" />
                  </div>
                ))}
              </div>
              {/* paragraph */}
              <div className="space-y-1.5">
                <span className="block h-2 w-full rounded-full bg-white/[0.1]" />
                <span className="block h-2 w-11/12 rounded-full bg-white/[0.1]" />
                <span className="block h-2 w-3/4 rounded-full bg-white/[0.08]" />
              </div>
            </div>
          </div>
          <p className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
            Carousels, scripts, and layout an agent has to fight through.
          </p>
        </div>

        {/* connector */}
        <div className={`flex items-center justify-center lg:flex-col lg:gap-3 ${view === 'both' ? '' : 'hidden lg:flex'}`}>
          <div className="flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="size-3.5 text-cyan-300" />
            Nexez derives
          </div>
          <ArrowRight className="size-5 rotate-90 text-white/30 lg:rotate-0" />
        </div>

        {/* Agent surface */}
        <div className={`nx-tile p-4 transition-all duration-300 ${agentCls}`}>
          <p className="mb-3 px-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">What agents get</p>
          <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.03] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Acme Strategy Studio</span>
              <span className="nx-chip">readiness 92</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {[
                ['Strategy Session', '$450'],
                ['Retainer', 'from $3,000/mo'],
                ['SEO Audit', 'fixed scope'],
              ].map(([n, p]) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded-md border border-border bg-black/30 px-3 py-2 text-xs"
                >
                  <span className="text-zinc-200">{n}</span>
                  <span className="font-mono text-cyan-200">{p}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['book', 'buy', 'contact', 'negotiate'].map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-200"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
            Offers, pricing, actions, and schema — zero ambiguity.
          </p>
        </div>
      </div>
    </div>
  )
}
