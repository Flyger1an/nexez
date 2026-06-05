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
          <div className="overflow-hidden rounded-lg border border-border bg-[#0c0c12] text-left">
            {/* browser chrome */}
            <div className="flex items-center gap-1.5 border-b border-border bg-white/[0.04] px-3 py-2">
              <span className="size-2 rounded-full bg-white/25" />
              <span className="size-2 rounded-full bg-white/25" />
              <span className="size-2 rounded-full bg-white/25" />
              <span className="ml-2 truncate rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                axlestrategy.com/services
              </span>
            </div>
            <div className="p-4 text-[11px] leading-relaxed">
              {/* nav */}
              <div className="flex items-center gap-3 border-b border-white/5 pb-2.5">
                <span className="text-[13px] font-semibold text-white">Axle</span>
                <span className="text-zinc-500">Home</span>
                <span className="text-zinc-400">Services</span>
                <span className="hidden text-zinc-500 sm:inline">About</span>
                <span className="hidden text-zinc-500 sm:inline">Blog</span>
                <span className="ml-auto rounded bg-white/10 px-2 py-1 text-[10px] text-zinc-200">Book a call</span>
              </div>

              {/* hero — marketing, not structured */}
              <div className="mt-3 rounded-md bg-gradient-to-br from-violet-500/25 via-white/[0.05] to-cyan-500/15 p-3.5">
                <p className="text-[15px] font-semibold tracking-tight text-white">Strategy that scales your B2B.</p>
                <p className="mt-1 text-[11px] text-zinc-400">Trusted by 200+ founders to find their next growth lever.</p>
                <div className="mt-2.5 flex gap-2">
                  <span className="rounded bg-white/90 px-2.5 py-1 text-[10px] font-medium text-black">Get started</span>
                  <span className="rounded border border-white/15 px-2.5 py-1 text-[10px] text-zinc-300">Watch demo</span>
                </div>
              </div>

              {/* cookie clutter */}
              <div className="mt-2.5 flex items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10px] text-zinc-500">
                <span>🍪 We use cookies to improve your experience.</span>
                <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-zinc-300">Accept</span>
              </div>

              {/* the actual offers — buried in prose */}
              <p className="mt-3 text-[9px] uppercase tracking-[0.18em] text-zinc-500">Our services</p>
              <ul className="mt-1.5 space-y-1 text-zinc-400">
                <li>• <span className="text-zinc-200">Strategy Session</span>: a focused 60 minute deep dive. <span className="text-zinc-300">From $450.</span></li>
                <li>• <span className="text-zinc-200">Retainer</span>: ongoing partnership, <span className="text-zinc-300">starting $3,000/mo.</span></li>
                <li>• <span className="text-zinc-200">SEO Audit</span>: comprehensive, fixed scope review.</li>
              </ul>

              {/* testimonial + newsletter clutter */}
              <div className="mt-3 rounded border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] italic text-zinc-500">
                “★★★★★ Axle transformed our pipeline.” Jane, CEO
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                <span className="truncate">Subscribe to our newsletter for growth tips</span>
                <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-zinc-300">→</span>
              </div>
            </div>
          </div>
          <p className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
            The same offers exist, buried in nav, marketing copy, banners, and testimonials an agent has to fight through.
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
              <span className="text-sm font-medium text-white">Axle Strategy</span>
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
            Offers, pricing, actions, and schema. Zero ambiguity.
          </p>
        </div>
      </div>
    </div>
  )
}
