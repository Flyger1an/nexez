import {
  ArrowRight,
  Bot,
  Globe2,
  TrendingUp,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Search,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { AgentPage, PUBLIC_PAGE_SELECT, getOfferCount, getReadinessScore } from '../lib/agent-page'
import { supabase } from '../lib/supabase'
import { agentRuntimeUrl, appUrl } from '../lib/site'
import { publicLaunchVisiblePages } from '../lib/public-page-visibility'
import { SimulatorTeaser } from '../components/SimulatorTeaser'
import { AgentXray } from '../components/home/AgentXray'
import { ReadinessLab } from '../components/home/ReadinessLab'
import { LiveAgentFeed } from '../components/home/LiveAgentFeed'

// Marketing homepage: statically served (fast on nexez.ai) but revalidated every
// 5 min so the "Public examples" showcase picks up newly published pages without a
// redeploy. The always-live listing lives on /discovery.
export const revalidate = 300

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

// Hero stat ticker (the X-Ray instrument's "instrument readout" framing).
const stats = [
  { value: '<200ms', label: 'Agent page load' },
  { value: '19+', label: 'AI crawlers welcomed' },
  { value: '5', label: 'Formats per page' },
  { value: '0%', label: 'Fee until you get paid' },
]

// Agents that read structured pages — monogram lockups for the marquee.
const marqueeModels = [
  { name: 'ChatGPT', mark: 'G' },
  { name: 'Claude', mark: 'C' },
  { name: 'Gemini', mark: 'G' },
  { name: 'Perplexity', mark: 'P' },
  { name: 'Grok', mark: 'X' },
  { name: 'Copilot', mark: 'C' },
  { name: 'Llama', mark: 'L' },
  { name: 'Mistral', mark: 'M' },
  { name: 'DeepSeek', mark: 'D' },
  { name: 'Qwen', mark: 'Q' },
  { name: 'Cohere', mark: 'C' },
  { name: 'Amazon Nova', mark: 'N' },
]

export default async function NexezHome() {
  const { data: pages } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()
  const visiblePages = publicLaunchVisiblePages(pages)

  return (
    <main>
      {/* HERO — text + CTAs on the left, the draggable Agent X-Ray prominent on the right */}
      <section
        className="relative overflow-hidden border-b border-border"
        style={{
          background:
            'radial-gradient(120% 75% at 50% -12%, color-mix(in srgb, var(--signal) 9%, transparent), transparent 55%), var(--bg)',
        }}
      >
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(440px,0.9fr)] lg:gap-12">
            {/* LEFT — eyebrow, h1, copy, CTAs */}
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--signal)]"
                style={{
                  border: '1px solid color-mix(in srgb, var(--signal) 30%, transparent)',
                  background: 'color-mix(in srgb, var(--signal) 6%, transparent)',
                }}
              >
                <span className="nx-pulsedot size-1.5 rounded-full" style={{ background: 'var(--signal)' }} />
                The web has a second audience now
              </div>
              <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.95] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                Where AI agents <span className="nx-accent-text">buy from you.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                Your site is built for humans. Agents see something else entirely. Nexez derives the structured layer
                they read, so they can find, understand, and <span className="text-white">buy from you</span>.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href={appUrl('/create')} className="btn-primary h-11 px-5">
                  Get started free
                </a>
                <a href="/discovery" className="btn-secondary h-11 px-5">See live examples</a>
              </div>
            </div>

            {/* RIGHT — the draggable X-Ray gets its own prominent space */}
            <AgentXray />
          </div>

          {/* stat ticker — full width below the hero */}
          <div className="mt-12 flex overflow-hidden rounded-[13px] border border-border" style={{ background: 'var(--ov-02)' }}>
            {stats.map((s, i) => (
              <div key={s.label} className={`flex-1 px-4 py-[18px] sm:px-5 ${i < stats.length - 1 ? 'border-r border-border' : ''}`}>
                <div className="font-display text-xl font-bold tracking-[-0.02em] sm:text-[26px]">{s.value}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground sm:text-[12.5px]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENT LOGO MARQUEE */}
      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <p className="mb-5 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Read by every major agent
          </p>
          <div className="nx-marquee">
            <div className="nx-marquee-track">
              {[...marqueeModels, ...marqueeModels].map((m, i) => (
                <span
                  key={`${m.name}-${i}`}
                  aria-hidden={i >= marqueeModels.length}
                  className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap px-6"
                >
                  <span className="flex size-[27px] items-center justify-center rounded-[7px] border border-border bg-white/[0.03] font-mono text-[13px] font-bold text-muted-foreground">
                    {m.mark}
                  </span>
                  <span className="font-mono text-[18px] font-medium text-[var(--fg-muted-2)]">{m.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* READINESS LAB — interactive */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <p className="mb-4 font-mono text-[11.5px] uppercase tracking-[0.16em] text-[var(--signal)]">Readiness Lab · interactive</p>
          <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] md:text-5xl">
            Expose more. <span className="nx-accent-text">Agents understand more.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Each signal you publish raises your readiness score and unlocks a new action agents can take. Flip them on
            to see what becomes possible.
          </p>
          <div className="mt-10">
            <ReadinessLab />
          </div>
        </div>
      </section>

      {/* LIVE AGENT ACTIVITY — interactive */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <p className="mb-4 font-mono text-[11.5px] uppercase tracking-[0.16em] text-[var(--signal)]">Live agent activity</p>
          <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] md:text-5xl">
            See which agents convert, <span className="nx-accent-text">down to the offer.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Every session is attributed to the model behind it — so you can prove ROI in minutes, not quarters.
          </p>
          <div className="mt-10">
            <LiveAgentFeed />
          </div>
        </div>
      </section>

      {/* KEY FEATURES */}
      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">Key capabilities</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Everything you need to <span className="nx-accent-text">win agent traffic.</span>
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {keyFeatures.map(({ title, copy, Icon }) => (
              <div key={title} className="card flex items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-black">
                  <Icon className="size-4 text-[var(--signal)]" />
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
                  {i < workflow.length - 1 ? <ArrowRight className="size-4 text-white/20" /> : <CheckCircle2 className="size-4 text-[var(--ready)]/60" />}
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
            Agents pick one answer. <span className="nx-accent-text">Win the query.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Ask a real buyer question and watch a structured page resolve it into the exact offers, prices, and next
            actions an AI agent would use — then see what it takes to be the one it picks. Instantly, no signup.
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
            <a href="/discovery" className="btn-secondary h-10 px-4">
              Browse directory
              <ArrowRight className="size-4" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePages.slice(0, 6).map((page) => (
              <a key={page.id} href={agentRuntimeUrl(`/${page.slug}`)} className="nx-tile group block p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="line-clamp-1 text-lg font-medium group-hover:text-white">{page.name}</h3>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">/{page.slug}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ready</p>
                    <p className="mt-1 font-mono text-lg text-[var(--ready)]">{getReadinessScore(page)}%</p>
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

          {!visiblePages.length ? (
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
            Be the answer <span className="nx-accent-text">agents pick.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Deploy a crawlable, structured agent page in minutes, on a Nexez link or your own domain, and start
            measuring real discovery signals.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={appUrl('/create')} className="btn-primary h-11 px-5">
              Deploy your agent page
            </a>
            <a href="/discovery" className="btn-secondary h-11 px-5">See live examples</a>
          </div>
        </div>
      </section>
    </main>
  )
}
