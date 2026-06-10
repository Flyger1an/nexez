import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Globe2,
  TrendingUp,
  ShieldCheck,
  Sparkles,
  Code2,
  CheckCircle2,
  Layers,
  Search,
  Lock,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cookies } from 'next/headers'
import { AgentPage, PUBLIC_PAGE_SELECT, getOfferCount, getReadinessScore } from '../lib/agent-page'
import { supabase } from '../lib/supabase'
import { createClient } from '../utils/supabase/server'
import { SimulatorTeaser } from '../components/SimulatorTeaser'
import { HomeGauge } from '../components/HomeGauge'
import { PhilosophySplit } from '../components/PhilosophySplit'
import { CodeCopyButton } from '../components/CodeCopyButton'
import { CountUp } from '../components/CountUp'
import { HeroBackdrop } from '../components/HeroBackdrop'
import { TypewriterCode } from '../components/TypewriterCode'
import { ThemeToggle } from '../components/ThemeToggle'
import { NexezLogo } from '../components/NexezLogo'

const navLinks = [
  { label: 'Directory', href: '/directory' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Simulator', href: '/simulator' },
  { label: 'Leaderboard', href: '/leaderboard' },
]

type Feature = {
  title: string
  copy: string
  Icon: ComponentType<{ className?: string }>
}

const workflow = [
  { step: '01', title: 'Connect', copy: 'Bring in offers from your website, Calendly, Stripe, Shopify, Square, or add them by hand.' },
  { step: '02', title: 'Optimize', copy: 'Sharpen pricing, structure, and copy with AI Copilot, or edit every detail manually.' },
  { step: '03', title: 'Publish', copy: 'Go live on a Nexez link or your own custom domain.' },
  { step: '04', title: 'Measure', copy: 'Track agent visits, queries, conversion actions, and readiness over time.' },
]

const keyFeatures: Feature[] = [
  {
    title: 'AI Copilot',
    copy: 'Improve offers, pricing, and structure for the way agents actually parse. One click.',
    Icon: Sparkles,
  },
  {
    title: 'Agent Simulator',
    copy: 'See how ChatGPT, Claude, Grok, and Perplexity interpret your page before you publish.',
    Icon: Bot,
  },
  {
    title: 'Competitor Analyzer',
    copy: 'Analyze how agents see any competitor’s website: structure, pricing, and readiness.',
    Icon: Search,
  },
  {
    title: 'Analytics',
    copy: 'Track agent visits, queries, and conversions, attributed by model.',
    Icon: TrendingUp,
  },
  {
    title: 'Custom Domains',
    copy: 'Host your agent page on your own domain, with SSL and brand root artifacts.',
    Icon: Globe2,
  },
  {
    title: 'Trust Score',
    copy: 'Build credibility with agents and humans from readiness, verification, and real completion rates.',
    Icon: ShieldCheck,
  },
]

const stats = [
  { value: '<200ms', label: 'Agent page load' },
  { value: '19+', label: 'AI crawlers welcomed' },
  { value: '5', label: 'Agent formats per page' },
  { value: '6', label: 'One click integrations' },
]

const agents = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot']

// Illustrative figures for the homepage analytics preview (clearly a sample).
const agentMix = [
  { name: 'ChatGPT', pct: 41, color: '#10B981' },
  { name: 'Claude', pct: 27, color: '#A78BFA' },
  { name: 'Perplexity', pct: 18, color: '#00D4FF' },
  { name: 'Grok', pct: 9, color: '#F59E0B' },
  { name: 'Other', pct: 5, color: '#71717A' },
]

const sampleQueries = [
  { q: 'mobile massage near me this weekend', n: 38 },
  { q: 'B2B strategy retainer pricing', n: 24 },
  { q: 'emergency plumber that takes card', n: 19 },
]

export default async function NexezHome() {
  const cookieStore = await cookies()
  const auth = createClient(cookieStore)
  const {
    data: { user },
  } = await auth.auth.getUser()

  const { data: pages } = await supabase
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  return (
    <main className="min-h-screen bg-background text-white">
      <nav className="nx-nav sticky top-0 z-50 border-b border-border backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md border border-border bg-white text-black">
              <NexezLogo className="size-6" />
            </div>
            <span className="text-sm font-medium tracking-tight">Nexez</span>
          </a>

          <div className="hidden items-center gap-0.5 lg:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className="hidden items-center gap-2 sm:flex">
              <ThemeToggle />
              {user ? (
                <a href="/dashboard" className="btn-secondary h-9 px-3">Overview</a>
              ) : (
                <a href="/login" className="btn-secondary h-9 px-3">Sign in</a>
              )}
            </div>
            <a href="/create" className="btn-primary h-9 px-3">
              Create page
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <HeroBackdrop />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.85fr)] lg:items-center lg:py-28">
          <div>
            <div className="nx-shimmer inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
              <Bot className="size-3.5 text-cyan-300" />
              AI readable business pages
            </div>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              Pages built for <span className="nx-accent-text">AI agents.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Create a clean, structured page that AI agents can understand and act on. Host it on your own
              domain or a Nexez link.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/create" className="btn-primary h-11 px-5">
                Get started free
                <ArrowRight className="size-4" />
              </a>
              <a href="/simulator" className="btn-secondary h-11 px-5">Test agent parsing</a>
            </div>
            <p className="mt-4 text-sm text-zinc-500">
              Deploy your first page built for AI agents in seconds. No code, free to start.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              {stats.slice(0, 3).map((s) => (
                <div key={s.label}>
                  <p className="font-mono text-2xl font-semibold tracking-tight text-white">{s.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* AGENT LOGO MARQUEE */}
      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <p className="mb-6 text-center text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Built to be read by every major agent
          </p>
          <div className="nx-marquee">
            <div className="nx-marquee-track gap-x-12">
              {[...agents, ...agents].map((a, i) => (
                <span
                  key={`${a}-${i}`}
                  aria-hidden={i >= agents.length}
                  className="nx-logo inline-flex shrink-0 items-center gap-2 text-base font-medium tracking-tight"
                >
                  <span className="size-1.5 rounded-full bg-current opacity-60" />
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DUAL PHILOSOPHY — human vs agent */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm font-medium text-muted-foreground">One source of truth, two experiences</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Beautiful for humans. <span className="nx-accent-text">Brutally clean for agents.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Your site is built for humans, so agents struggle to parse your offers, pricing, and next steps. Nexez
              derives a precise, structured surface from the same data you edit once. Humans get the polished page;
              agents get clean offers, clear pricing, and direct actions.
            </p>
          </div>

          <PhilosophySplit />
        </div>
      </section>

      {/* BENTO — what agents receive */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">What you get</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                Everything an agent needs, <span className="nx-accent-text">structured.</span>
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Your human website stays intact. From the same data, Nexez generates the lightweight, structured
              layer agents can read, and serves it on a Nexez link or your own custom domain.
            </p>
          </div>

          <BentoGrid />
        </div>
      </section>

      {/* ANALYTICS COMMAND CENTER */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-orb nx-orb--purple !opacity-20" style={{ top: '-18rem', left: 'auto', right: '-10rem' }} />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-20">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Proof, not vanity metrics</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                See exactly how agents <span className="nx-accent-text">discover and buy.</span>
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Every visit, query, and conversion is attributed by agent (ChatGPT, Claude, Perplexity, Grok), so you can
              prove ROI in minutes, not quarters.
            </p>
          </div>

          <AnalyticsSnapshot />
        </div>
      </section>

      {/* KEY FEATURES */}
      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">Key features</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Everything you need to <span className="nx-accent-text">win agent traffic.</span>
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {keyFeatures.map(({ title, copy, Icon }) => (
              <div key={title} className="card flex items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-black">
                  <Icon className="size-4 text-[#A78BFA]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium tracking-tight">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">From website to agent ready.</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Intentionally boring where it should be: import, edit, publish, measure. The magic is in the structure
              agents receive.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflow.map((item, i) => (
              <div key={item.step} className="nx-tile p-5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs text-muted-foreground">{item.step}</p>
                  {i < workflow.length - 1 ? <ArrowRight className="size-4 text-white/20" /> : <CheckCircle2 className="size-4 text-emerald-300/60" />}
                </div>
                <h3 className="mt-4 text-xl font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SIMULATOR */}
      <section id="simulator" className="border-b border-border bg-white/[0.02] py-20">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <p className="text-sm font-medium text-muted-foreground">Agent simulator</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
            See your page through an <span className="nx-accent-text">agent’s eyes.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Ask a real buyer question. Watch a structured page resolve it into the exact offers, prices, and next
            actions an AI agent would use, instantly and with no signup.
          </p>
          <div className="mt-8">
            <SimulatorTeaser />
          </div>
        </div>
      </section>

      {/* PUBLIC EXAMPLES */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Public examples</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">Pages agents can discover now.</h2>
            </div>
            <a href="/directory" className="btn-secondary h-10 px-4">
              Browse directory
              <ArrowRight className="size-4" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pages?.slice(0, 6).map((page) => (
              <a key={page.id} href={`/${page.slug}`} className="nx-tile group block p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="line-clamp-1 text-lg font-medium group-hover:text-white">{page.name}</h3>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">/{page.slug}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ready</p>
                    <p className="mt-1 font-mono text-lg text-emerald-300">{getReadinessScore(page)}%</p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {page.description || 'A structured offer page built for AI agents.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-1">{getOfferCount(page)} offers</span>
                  {page.location ? <span className="rounded-full border border-border px-2 py-1">{page.location}</span> : null}
                </div>
              </a>
            ))}
          </div>

          {!pages?.length ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">No published pages yet. Be the first.</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-orb nx-orb--purple !opacity-25" style={{ top: 'auto', bottom: '-22rem', left: '50%', transform: 'translateX(-50%)' }} />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 py-24 text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] md:text-6xl">
            Ready to get discovered <span className="nx-accent-text">by AI?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Deploy a crawlable, structured agent page in minutes, on a Nexez link or your own domain, and start
            measuring real discovery signals.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="/create" className="btn-primary h-11 px-5">
              Deploy your agent page
              <ArrowRight className="size-4" />
            </a>
            <a href="/directory" className="btn-secondary h-11 px-5">See live examples</a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}

// Modern bento of the structured artifacts Nexez emits: the product in one glance.
function BentoGrid() {
  const agentPayload = `{
  "business": "Axle Strategy",
  "best_fit": "B2B founders",
  "offers": [
    { "name": "Strategy Session", "price": "$450", "book": true },
    { "name": "Retainer", "price": "from $3,000/mo" },
    { "name": "SEO Audit", "price": "fixed scope" }
  ],
  "actions": ["book", "buy", "contact", "negotiate"],
  "schema": ["Service", "Offer", "FAQPage"],
  "readiness": 92
}`

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:auto-rows-[170px]">
      {/* Agent-readable payload — the centerpiece */}
      <div className="nx-tile group flex flex-col p-5 md:col-span-2 md:row-span-2">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-cyan-300" />
          <p className="text-sm font-medium text-white/90">What agents read</p>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-200">
            <span className="nx-live-dot" /> agent ready
          </span>
        </div>
        <div className="relative mt-4 flex-1">
          <div className="absolute right-2 top-2 z-10 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
            <CodeCopyButton text={agentPayload} label="Copy agent.json" />
          </div>
          <TypewriterCode
            text={agentPayload}
            className="h-full overflow-hidden whitespace-pre-wrap rounded-lg border border-border bg-black/40 p-4 font-mono text-[11px] leading-5 text-zinc-300"
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          One payload powers JSON-LD, llms.txt, <span className="text-zinc-300">agent.json</span>, an MCP endpoint, and
          clean semantic HTML.
        </p>
      </div>

      {/* Readiness gauge */}
      <div className="nx-tile flex flex-col items-center justify-center p-5">
        <HomeGauge value={92} />
      </div>

      {/* Schema formats */}
      <div className="nx-tile flex flex-col p-5">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-[#A78BFA]" />
          <p className="text-sm font-medium text-white/90">Every format</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5">
          {['JSON-LD', 'llms.txt', 'agent.json', 'MCP', 'OpenAPI', 'schema.org'].map((f) => (
            <span key={f} className="nx-chip">{f}</span>
          ))}
        </div>
      </div>

      {/* Mini traffic trend */}
      <div className="nx-tile flex flex-col p-5 md:col-span-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-300" />
            <p className="text-sm font-medium text-white/90">Agent visits</p>
          </div>
          <p className="font-mono text-xs text-emerald-300">+18.4%</p>
        </div>
        <MiniSparkline />
      </div>
    </div>
  )
}

function MiniSparkline() {
  const line = 'M0,52 L30,46 L60,49 L90,38 L120,42 L150,30 L180,34 L210,22 L240,27 L270,14 L300,18'
  const area = `${line} L300,64 L0,64 Z`
  return (
    <svg viewBox="0 0 300 64" preserveAspectRatio="none" className="mt-auto h-16 w-full" role="img" aria-label="Sample agent visit trend">
      <defs>
        <linearGradient id="nx-mini-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="nx-mini-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nx-mini-fill)" />
      <path d={line} fill="none" stroke="url(#nx-mini-stroke)" strokeWidth="2" strokeLinecap="round" className="nx-spark" />
    </svg>
  )
}

// The signature split: a cluttered human site vs the precise agent surface.
function ProductPreview() {
  return (
    <div className="rounded-xl border border-border bg-white/[0.03] p-2 shadow-2xl shadow-black">
      <div className="nx-scan overflow-hidden rounded-lg border border-border bg-black">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red-400" />
            <span className="size-2 rounded-full bg-amber-400" />
            <span className="size-2 rounded-full bg-emerald-400" />
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white/[0.04] px-2 py-0.5 text-zinc-300">
              <Lock className="size-3 text-emerald-300" />
              offers.axlestrategy.com
            </span>
            <span className="hidden text-[10px] text-zinc-500 sm:inline">or nexez.app/axle</span>
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-[0.9fr_1fr]">
          <div className="border-b border-border p-5 md:border-b-0 md:border-r">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Agent page</p>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Axle Strategy</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Executive strategy sessions, retainers, and audits for B2B founders.
            </p>
            <div className="mt-5 space-y-2">
              {['Strategy Session · $450', 'Retainer · from $3,000/mo', 'SEO Audit · fixed scope'].map((item) => (
                <div key={item} className="rounded-md border border-border bg-white/[0.03] px-3 py-2 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">What agents read</p>
            <pre className="mt-4 overflow-hidden rounded-lg border border-border bg-white/[0.03] p-4 font-mono text-[11px] leading-5 text-zinc-300">
{`{
  "offers": 3,
  "best_fit": "B2B founders",
  "actions": ["book", "buy", "contact"],
  "schema": ["Service", "Offer"],
  "readiness": 92
}`}
            </pre>
            <div className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
              <p className="text-sm font-medium text-emerald-100">Agent ready</p>
              <p className="mt-1 text-xs leading-5 text-emerald-100/80">Clear pricing, buyer fit, schema, and booking action.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Decorative, illustrative analytics preview: a glass "command center" that
// signals the depth of measurement Nexez ships. All static SVG/CSS, no client JS.
function AnalyticsSnapshot() {
  const kpis: {
    label: string
    value: number
    delta: string
    up: boolean
    prefix?: string
    suffix?: string
    decimals?: number
    separator?: boolean
  }[] = [
    { label: 'Agent visits', value: 2847, separator: true, delta: '+18.4%', up: true },
    { label: 'Conversions', value: 312, delta: '+9.1%', up: true },
    { label: 'Avg. readiness', value: 92, delta: '+6 pts', up: true },
    { label: 'Pipeline', value: 48.2, prefix: '$', suffix: 'k', decimals: 1, delta: '+$7.3k', up: true },
  ]
  const maxMix = Math.max(...agentMix.map((m) => m.pct))

  return (
    <div className="nx-glass-panel overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="nx-live-dot" />
          <span className="text-xs font-medium text-white/90">Analytics</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">· Live preview</span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-white/[0.03] p-0.5 text-[11px]">
          <span className="rounded px-2 py-1 text-muted-foreground">7d</span>
          <span className="rounded bg-white/10 px-2 py-1 text-white">30d</span>
          <span className="rounded px-2 py-1 text-muted-foreground">All</span>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-white/[0.03] p-3">
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <CountUp
                value={k.value}
                prefix={k.prefix}
                suffix={k.suffix}
                decimals={k.decimals}
                separator={k.separator}
                className="mt-1.5 block font-mono text-xl tracking-tight text-white sm:text-2xl"
              />
              <p className={`mt-1 inline-flex items-center gap-1 text-[10px] ${k.up ? 'text-emerald-300' : 'text-red-300'}`}>
                <TrendingUp className="size-3" />
                {k.delta}
              </p>
            </div>
          ))}
        </div>

        {/* Chart + agent mix */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0 rounded-lg border border-border bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-white/90">Agent traffic & conversions</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">30 days</p>
            </div>
            <TrafficSparkline />
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#00D4FF]" /> Agent visits</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#A78BFA]" /> Conversions</span>
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-border bg-white/[0.02] p-4">
            <p className="mb-3 text-xs font-medium text-white/90">Agents by model</p>
            <div className="space-y-2.5">
              {agentMix.map((m) => (
                <div key={m.name}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300">{m.name}</span>
                    <span className="font-mono text-muted-foreground">{m.pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="nx-bar h-full rounded-full"
                      style={{ width: `${(m.pct / maxMix) * 100}%`, background: m.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Demand + funnel */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0 rounded-lg border border-border bg-white/[0.02] p-4">
            <p className="mb-3 text-xs font-medium text-white/90">What agents asked</p>
            <div className="space-y-2">
              {sampleQueries.map((s) => (
                <div key={s.q} className="flex items-center justify-between gap-3 rounded-md border border-border bg-white/[0.02] px-3 py-2">
                  <span className="truncate text-[12px] text-zinc-300">“{s.q}”</span>
                  <span className="shrink-0 rounded-full bg-[#00D4FF]/10 px-2 py-0.5 font-mono text-[10px] text-[#7DE3FF]">{s.n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-border bg-white/[0.02] p-4">
            <p className="mb-3 text-xs font-medium text-white/90">Conversion funnel</p>
            <div className="space-y-2">
              {[
                { label: 'Discovered', w: 100, v: '2,847', c: 'rgba(0,212,255,0.5)' },
                { label: 'Intent', w: 46, v: '1,309', c: 'rgba(167,139,250,0.55)' },
                { label: 'Converted', w: 18, v: '312', c: 'rgba(16,185,129,0.6)' },
              ].map((f) => (
                <div key={f.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300">{f.label}</span>
                    <span className="font-mono text-muted-foreground">{f.v}</span>
                  </div>
                  <div className="h-5 overflow-hidden rounded bg-white/[0.04]">
                    <div className="nx-bar h-full rounded" style={{ width: `${f.w}%`, background: f.c }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrafficSparkline() {
  // Two illustrative series over 30 days. viewBox space is 0..600 x 0..160.
  const visits = 'M0,118 L50,104 L100,110 L150,86 L200,92 L250,66 L300,74 L350,50 L400,58 L450,36 L500,44 L550,22 L600,28'
  const conv = 'M0,140 L50,134 L100,136 L150,124 L200,128 L250,116 L300,120 L350,108 L400,112 L450,98 L500,104 L550,88 L600,92'
  const visitsArea = `${visits} L600,160 L0,160 Z`

  return (
    <svg viewBox="0 0 600 160" preserveAspectRatio="none" className="h-32 w-full sm:h-40" role="img" aria-label="Sample agent traffic trend">
      <defs>
        <linearGradient id="nx-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="nx-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* baseline grid */}
      {[40, 80, 120].map((y) => (
        <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      <path d={visitsArea} fill="url(#nx-fill)" />
      <path d={conv} fill="none" stroke="#A78BFA" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" className="nx-spark" />
      <path d={visits} fill="none" stroke="url(#nx-stroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="nx-spark" />
      <circle cx="600" cy="28" r="4" fill="#00D4FF" />
      <circle cx="600" cy="28" r="4" fill="#00D4FF" opacity="0.4">
        <animate attributeName="r" values="4;9;4" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function SiteFooter() {
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: 'Product',
      links: [
        { label: 'Create a page', href: '/create' },
        { label: 'Directory', href: '/directory' },
        { label: 'Marketplace', href: '/marketplace' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Leaderboard', href: '/leaderboard' },
      ],
    },
    {
      title: 'Agents',
      links: [
        { label: 'Agent simulator', href: '/simulator' },
        { label: 'OpenAPI', href: '/openapi.json' },
        { label: 'robots.txt', href: '/robots.txt' },
        { label: 'sitemap.xml', href: '/sitemap.xml' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'Support', href: '/support' },
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
        { label: 'Sign in', href: '/login' },
      ],
    },
  ]

  return (
    <footer className="border-t border-border bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <a href="/" className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-md border border-border bg-white text-black">
                <NexezLogo className="size-6" />
              </div>
              <span className="text-sm font-medium tracking-tight">Nexez</span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
              The agent readable layer for your business: structured, crawlable, and built to convert AI traffic.
            </p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {['JSON-LD', 'llms.txt', 'agent.json', 'MCP'].map((f) => (
                <span key={f} className="nx-chip">{f}</span>
              ))}
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white">
                      {l.label}
                      <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="nx-hairline my-10" />

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Nexez. Built for the agentic web.</p>
          <p className="inline-flex items-center gap-2">
            <Globe2 className="size-3.5 text-cyan-300" />
            Human first management · Agent first consumption
          </p>
        </div>
      </div>
    </footer>
  )
}
