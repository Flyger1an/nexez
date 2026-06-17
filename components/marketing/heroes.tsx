import type { ReactNode } from 'react'
import {
  ArrowRight,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  Globe,
  Lock,
  ScanLine,
  Server,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Terminal,
  Unlock,
} from 'lucide-react'
import type { MarketingPageContent } from '../../lib/marketing-content'

// Per-page marketing heroes. Each page gets its OWN layout + topical graphic +
// accent so the section above the fold reads as a distinct identity, while a
// shared HeroHeadline keeps type, CTAs, and rhythm consistent across the family.
// Everything is theme-aware via the Liquid Glass tokens (var(--signal|--ready|
// --amber|--prism|--fg…)) — no raw hexes, so it passes the palette guard and
// works in both light and dark.

export type Accent = 'signal' | 'ready' | 'amber'
const tone = (a: Accent) => `var(--${a})`

function HeroHeadline({
  content,
  align = 'left',
  maxClass = 'max-w-xl',
}: {
  content: MarketingPageContent
  align?: 'left' | 'center'
  maxClass?: string
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : ''}>
      <div className={`eyebrow ${align === 'center' ? 'justify-center' : ''}`}>{content.eyebrow}</div>
      <h1 className="mt-5 text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
        {content.title} <span className="nx-accent-text">{content.accent}</span>
      </h1>
      <p className={`mt-6 ${maxClass} text-base leading-7 text-muted-foreground md:text-lg ${align === 'center' ? 'mx-auto' : ''}`}>
        {content.description}
      </p>
      <div className={`mt-8 flex flex-col gap-3 sm:flex-row ${align === 'center' ? 'sm:justify-center' : ''}`}>
        <a href={content.primaryCta.href} className="btn-primary h-11 px-5">
          {content.primaryCta.label}
          <ArrowRight className="size-4" />
        </a>
        {content.secondaryCta ? (
          <a href={content.secondaryCta.href} className="btn-secondary h-11 px-5">
            {content.secondaryCta.label}
          </a>
        ) : null}
      </div>
    </div>
  )
}

function StatRow({ content, accent }: { content: MarketingPageContent; accent: Accent }) {
  if (!content.stats?.length) return null
  return (
    <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
      {content.stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-border bg-white/[0.03] p-4">
          <p className="font-mono text-2xl font-semibold" style={{ color: tone(accent) }}>
            {stat.value}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}

// Shared hero shell: background field + accent-tinted orbs + a two-column grid.
function HeroShell({
  accent,
  children,
  single = false,
}: {
  accent: Accent
  children: ReactNode
  single?: boolean
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="nx-grid" />
        <div
          className="nx-orb !opacity-25"
          style={{ width: '34rem', height: '34rem', top: '-12rem', left: '-6rem', background: `radial-gradient(circle at 30% 30%, ${tone(accent)}, transparent 62%)` }}
        />
        <div
          className="nx-orb !opacity-20"
          style={{ width: '26rem', height: '26rem', top: '-4rem', right: '-6rem', background: `radial-gradient(circle at 60% 40%, ${tone(accent)}, transparent 60%)` }}
        />
      </div>
      <div
        className={`relative z-10 mx-auto max-w-7xl px-5 py-20 lg:py-24 ${
          single ? '' : 'grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.8fr)] lg:items-center'
        }`}
      >
        {children}
      </div>
    </section>
  )
}

/* ───────────────────────────── how-it-works: pipeline ───────────────────────────── */
export function HowItWorksHero({ content }: { content: MarketingPageContent }) {
  const stages = [
    { k: 'Website', d: 'Bloated, human-first', icon: Globe, tone: 'var(--fg-muted)' },
    { k: 'Nexez', d: 'Clean, structured', icon: Boxes, tone: 'var(--signal)' },
    { k: 'Agents', d: 'Parse · compare · act', icon: Sparkles, tone: 'var(--ready)' },
  ]
  return (
    <HeroShell accent="signal">
      <div>
        <HeroHeadline content={content} />
        <StatRow content={content} accent="signal" />
      </div>
      <div className="nx-glass-panel p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <p className="text-sm font-medium">The transformation</p>
          <span className="font-mono text-xs text-muted-foreground">one source of truth</span>
        </div>
        <div className="mt-5 space-y-3">
          {stages.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.k}>
                <div className="flex items-center gap-4 rounded-xl border border-border bg-white/[0.03] p-4">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg border"
                    style={{ borderColor: `color-mix(in srgb, ${s.tone} 40%, transparent)`, background: `color-mix(in srgb, ${s.tone} 12%, transparent)` }}
                  >
                    <Icon className="size-5" style={{ color: s.tone }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium" style={{ color: s.tone }}>{s.k}</p>
                    <p className="text-xs text-muted-foreground">{s.d}</p>
                  </div>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                {i < stages.length - 1 ? (
                  <div className="ml-[2.05rem] flex h-6 items-center">
                    <span className="h-full w-px" style={{ background: 'linear-gradient(var(--signal), var(--ready))' }} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </HeroShell>
  )
}

/* ───────────────────────────── agent-readiness: gauge ───────────────────────────── */
export function ReadinessHero({ content }: { content: MarketingPageContent }) {
  const pct = 92
  const r = 78
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  const steps = ['Parse', 'Verify', 'Act']
  return (
    <HeroShell accent="ready">
      <div>
        <HeroHeadline content={content} />
        <div className="mt-8 flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3 py-1.5 text-xs">
              <span className="font-mono" style={{ color: 'var(--ready)' }}>0{i + 1}</span>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="nx-glass-panel flex flex-col items-center p-8">
        <div className="relative">
          <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label={`Readiness ${pct} percent`}>
            <circle cx="100" cy="100" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
            <circle
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="var(--ready)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-5xl font-semibold" style={{ color: 'var(--ready)' }}>{pct}</span>
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">readiness</span>
          </div>
        </div>
        <div className="mt-6 w-full space-y-2">
          {['Offers structured', 'Artifacts exposed', 'Trust signals present'].map((label) => (
            <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" style={{ color: 'var(--ready)' }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </HeroShell>
  )
}

/* ───────────────────────────── developers: terminal ───────────────────────────── */
export function DevelopersHero({ content }: { content: MarketingPageContent }) {
  return (
    <HeroShell accent="signal">
      <div>
        <HeroHeadline content={content} />
        <StatRow content={content} accent="signal" />
      </div>
      <div className="nx-glass-panel overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="size-3 rounded-full" style={{ background: 'var(--amber)' }} />
          <span className="size-3 rounded-full" style={{ background: 'var(--ready)' }} />
          <span className="size-3 rounded-full" style={{ background: 'var(--signal)' }} />
          <span className="ml-2 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Terminal className="size-3.5" /> nexez.app/&#123;slug&#125;/agent.json
          </span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-6">
          <code>
            <span className="text-muted-foreground">{'{'}</span>
            {'\n  '}<span style={{ color: 'var(--signal)' }}>&quot;business&quot;</span>: <span style={{ color: 'var(--ready)' }}>&quot;Nexez Agency&quot;</span>,
            {'\n  '}<span style={{ color: 'var(--signal)' }}>&quot;offers&quot;</span>: [
            {'\n    '}{'{ '}<span style={{ color: 'var(--signal)' }}>&quot;name&quot;</span>: <span style={{ color: 'var(--ready)' }}>&quot;Strategy Session&quot;</span>,
            {'\n      '}<span style={{ color: 'var(--signal)' }}>&quot;price&quot;</span>: <span style={{ color: 'var(--amber)' }}>450</span>,
            {'\n      '}<span style={{ color: 'var(--signal)' }}>&quot;action&quot;</span>: <span style={{ color: 'var(--ready)' }}>&quot;checkout&quot;</span> {'}'}
            {'\n  '}],
            {'\n  '}<span style={{ color: 'var(--signal)' }}>&quot;readiness&quot;</span>: <span style={{ color: 'var(--amber)' }}>92</span>
            {'\n'}<span className="text-muted-foreground">{'}'}</span>
          </code>
        </pre>
        <div className="grid grid-cols-3 gap-px border-t border-border bg-[var(--border)] font-mono text-[11px]">
          {['/agent-pages.json', '/api/agent-search', '/openapi.json'].map((ep) => (
            <div key={ep} className="truncate bg-[var(--bg-2)] px-3 py-2 text-muted-foreground" style={{ borderTop: `2px solid var(--signal)` }}>
              {ep}
            </div>
          ))}
        </div>
      </div>
    </HeroShell>
  )
}

/* ───────────────────────────── security: host boundaries ───────────────────────────── */
export function SecurityHero({ content }: { content: MarketingPageContent }) {
  const hosts = [
    { host: 'nexez.ai', role: 'Public education + discovery', state: 'open', icon: Globe },
    { host: 'app.nexez.ai', role: 'Authenticated creation + billing', state: 'gated', icon: Lock },
    { host: 'nexez.app', role: 'Crawlable agent pages + APIs', state: 'open', icon: Unlock },
  ]
  return (
    <HeroShell accent="amber">
      <div>
        <HeroHeadline content={content} />
        <StatRow content={content} accent="amber" />
      </div>
      <div className="nx-glass-panel p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="size-5" style={{ color: 'var(--amber)' }} />
          <p className="text-sm font-medium">Three separated surfaces</p>
        </div>
        <div className="space-y-3">
          {hosts.map((h) => {
            const Icon = h.icon
            const gated = h.state === 'gated'
            const c = gated ? 'var(--amber)' : 'var(--ready)'
            return (
              <div
                key={h.host}
                className="flex items-center gap-4 rounded-xl border bg-white/[0.03] p-4"
                style={{ borderColor: `color-mix(in srgb, ${c} 30%, var(--border))` }}
              >
                <Icon className="size-5 shrink-0" style={{ color: c }} />
                <div className="min-w-0">
                  <p className="font-mono text-sm">{h.host}</p>
                  <p className="text-xs text-muted-foreground">{h.role}</p>
                </div>
                <span
                  className="ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider"
                  style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}
                >
                  {gated ? 'Auth-gated' : 'Public'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </HeroShell>
  )
}

/* ───────────────────────────── integrations: hub + spokes ───────────────────────────── */
export function IntegrationsHero({ content }: { content: MarketingPageContent }) {
  const nodes = [
    { label: 'Calendly', icon: CalendarClock, tone: 'var(--ready)', x: 50, y: 8 },
    { label: 'Stripe', icon: CreditCard, tone: 'var(--signal)', x: 90, y: 30 },
    { label: 'Square', icon: Store, tone: 'var(--amber)', x: 90, y: 72 },
    { label: 'Shopify', icon: ShoppingBag, tone: 'var(--ready)', x: 50, y: 92 },
    { label: 'CSV', icon: FileSpreadsheet, tone: 'var(--signal)', x: 10, y: 72 },
    { label: 'Website', icon: Globe, tone: 'var(--amber)', x: 10, y: 30 },
  ]
  return (
    <HeroShell accent="ready">
      <div>
        <HeroHeadline content={content} />
        <StatRow content={content} accent="ready" />
      </div>
      <div className="nx-glass-panel p-6">
        <div className="relative mx-auto aspect-square w-full max-w-[360px]">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {nodes.map((n) => (
              <line key={n.label} x1="50" y1="50" x2={n.x} y2={n.y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 2" />
            ))}
          </svg>
          {nodes.map((n) => {
            const Icon = n.icon
            return (
              <div
                key={n.label}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
              >
                <div
                  className="flex size-11 items-center justify-center rounded-xl border bg-[var(--bg-2)]"
                  style={{ borderColor: `color-mix(in srgb, ${n.tone} 40%, transparent)` }}
                >
                  <Icon className="size-5" style={{ color: n.tone }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{n.label}</span>
              </div>
            )
          })}
          <div className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border border-[var(--signal)]/40 bg-[var(--signal)]/10">
            <Boxes className="size-6" style={{ color: 'var(--signal)' }} />
            <span className="mt-0.5 text-[9px] font-medium" style={{ color: 'var(--signal)' }}>Nexez</span>
          </div>
        </div>
      </div>
    </HeroShell>
  )
}

/* ───────────────────────────── compare: 3-way table ───────────────────────────── */
export function CompareHero({ content }: { content: MarketingPageContent }) {
  const rows: Array<[string, boolean, boolean, boolean]> = [
    ['Structured offers', false, false, true],
    ['Direct buy / book action', false, false, true],
    ['Agent-readable artifacts', false, false, true],
    ['You own the page', true, false, true],
    ['Built for AI parsing', false, false, true],
  ]
  const cols = ['Website', 'Directory', 'Nexez']
  return (
    <HeroShell accent="ready" single>
      <div className="max-w-3xl">
        <HeroHeadline content={content} />
      </div>
      <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-white/[0.02]">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="border-b border-border px-5 py-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">Capability</div>
          {cols.map((c, i) => (
            <div
              key={c}
              className={`border-b border-border px-5 py-4 text-center text-sm font-medium ${i === 2 ? 'bg-[var(--ready)]/10' : ''}`}
              style={i === 2 ? { color: 'var(--ready)' } : { color: 'var(--fg-muted)' }}
            >
              {c}
            </div>
          ))}
          {rows.map((row, ri) => (
            <Row key={ri} label={row[0] as string} vals={[row[1] as boolean, row[2] as boolean, row[3] as boolean]} last={ri === rows.length - 1} />
          ))}
        </div>
      </div>
    </HeroShell>
  )
}

function Row({ label, vals, last }: { label: string; vals: boolean[]; last: boolean }) {
  return (
    <>
      <div className={`px-5 py-3.5 text-sm ${last ? '' : 'border-b border-border'}`}>{label}</div>
      {vals.map((v, i) => (
        <div
          key={i}
          className={`flex items-center justify-center px-5 py-3.5 ${last ? '' : 'border-b border-border'} ${i === 2 ? 'bg-[var(--ready)]/10' : ''}`}
        >
          {v ? (
            <CheckCircle2 className="size-5" style={{ color: i === 2 ? 'var(--ready)' : 'var(--fg-muted)' }} />
          ) : (
            <span className="text-lg leading-none text-muted-foreground/40">·</span>
          )}
        </div>
      ))}
    </>
  )
}

/* ───────────────────────────── enterprise: portfolio lattice ───────────────────────────── */
export function EnterpriseHero({ content }: { content: MarketingPageContent }) {
  return (
    <HeroShell accent="signal">
      <div>
        <HeroHeadline content={content} />
        <StatRow content={content} accent="signal" />
      </div>
      <div className="nx-glass-panel p-6">
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-[var(--signal)]/40 bg-[var(--signal)]/10 p-4">
          <Building2 className="size-6" style={{ color: 'var(--signal)' }} />
          <div>
            <p className="text-sm font-medium">One organization</p>
            <p className="text-xs text-muted-foreground">Governed, measured, consistent</p>
          </div>
          <span className="ml-auto font-mono text-xs text-muted-foreground">48 pages</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-border bg-white/[0.03]"
            >
              <Server className="size-4" style={{ color: i % 3 === 0 ? 'var(--signal)' : 'var(--fg-muted-2)' }} />
              <span className="h-1 w-5 rounded-full" style={{ background: i % 3 === 0 ? 'var(--ready)' : 'var(--border)' }} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Clients · locations · service lines — one structured layer</p>
      </div>
    </HeroShell>
  )
}

/* ───────────────────────────── examples: stacked template cards ───────────────────────────── */
export function ExamplesHero({ content }: { content: MarketingPageContent }) {
  const cards = [
    { name: 'Strategy Session', meta: '60 min · advisory', price: '$450', tone: 'var(--signal)' },
    { name: 'Monthly Retainer', meta: 'recurring · scope-based', price: '$3,000/mo', tone: 'var(--ready)' },
    { name: 'Fixed Audit', meta: 'deliverable · 2 weeks', price: 'from $1,200', tone: 'var(--amber)' },
  ]
  return (
    <HeroShell accent="amber">
      <div>
        <HeroHeadline content={content} />
        <StatRow content={content} accent="amber" />
      </div>
      <div className="space-y-3">
        {cards.map((card, i) => (
          <div
            key={card.name}
            className="nx-tile flex items-center gap-4 p-5"
            style={{ marginLeft: `${i * 1.25}rem` }}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: `color-mix(in srgb, ${card.tone} 40%, transparent)`, background: `color-mix(in srgb, ${card.tone} 12%, transparent)` }}>
              <ScanLine className="size-5" style={{ color: card.tone }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{card.name}</p>
              <p className="text-xs text-muted-foreground">{card.meta}</p>
            </div>
            <span className="shrink-0 font-mono text-sm" style={{ color: card.tone }}>{card.price}</span>
          </div>
        ))}
        <p className="pl-2 pt-1 text-xs text-muted-foreground">Each block is short, scannable, and machine-readable.</p>
      </div>
    </HeroShell>
  )
}
