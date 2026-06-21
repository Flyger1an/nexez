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
  { step: '01', title: 'Connect', copy: 'Import offers from your site, calendar, payments, or store.' },
  { step: '02', title: 'Optimize', copy: 'Clean up pricing, proof, actions, and schema.' },
  { step: '03', title: 'Publish', copy: 'Launch a fast, crawlable listing on Nexez or your domain.' },
  { step: '04', title: 'Measure', copy: 'See agent visits, intent, bookings, and sales.' },
]

const keyFeatures: Feature[] = [
  {
    title: 'AI Copilot',
    copy: 'Tighten offers for agent evaluation.',
    Icon: Sparkles,
  },
  {
    title: 'Agent Simulator',
    copy: 'Preview how agents parse your business.',
    Icon: Bot,
  },
  {
    title: 'Competitor Analysis',
    copy: 'See how agents compare your offer.',
    Icon: Search,
  },
  {
    title: 'Analytics',
    copy: 'Track visits, queries, and conversions.',
    Icon: TrendingUp,
  },
  {
    title: 'Custom Domains',
    copy: 'Publish on a trusted branded URL.',
    Icon: Globe2,
  },
  {
    title: 'Trust Score',
    copy: 'Surface quality signals agents can read.',
    Icon: ShieldCheck,
  },
]

// Hero stat ticker (the X-Ray instrument's "instrument readout" framing).
const stats = [
  { value: '<200ms', label: 'Agent-ready load' },
  { value: '19+', label: 'AI crawlers welcomed' },
  { value: '5', label: 'Structured formats' },
  { value: 'Live', label: 'Conversion analytics' },
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

const pinnedStories: Feature[] = [
  {
    title: 'Win more qualified discovery',
    copy: 'Match high-intent buyer queries with cleaner offers and clearer fit.',
    Icon: Search,
  },
  {
    title: 'Improve recommendation confidence',
    copy: 'Give agents pricing, proof, and next steps they can compare quickly.',
    Icon: ShieldCheck,
  },
  {
    title: 'Reduce friction to action',
    copy: 'Turn interest into booking, checkout, or lead capture with direct actions.',
    Icon: CheckCircle2,
  },
  {
    title: 'Prove what is driving revenue',
    copy: 'See which models, queries, and sessions create real outcomes.',
    Icon: TrendingUp,
  },
]

const problemCards = [
  { title: 'Websites hide intent', copy: 'Menus, scripts, and vague copy bury what agents need.' },
  { title: 'Agents need structure', copy: 'Offers, prices, proof, policies, and actions must be explicit.' },
  { title: 'Nexez makes it readable', copy: 'Publish one clean layer built for discovery and conversion.' },
]

const valueBullets = [
  'Structured offers',
  'Clear pricing and proof',
  'Agent-ready next steps',
  'Conversion analytics',
]

const analyticsBullets = [
  'Agent model',
  'Buyer query',
  'Comparison activity',
  'Booking or sale',
]

const discoveryFlow = [
  { title: 'Website', label: 'Human-first', Icon: Globe2 },
  { title: 'Nexez layer', label: 'Structured', Icon: Sparkles },
  { title: 'Agent action', label: 'Book or buy', Icon: Bot },
]

const schemaChips = ['Offers', 'Pricing', 'Proof', 'Actions']

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
        aria-label="Hero"
        data-section-name="Hero"
        style={{
          background:
            'radial-gradient(120% 75% at 50% -12%, color-mix(in srgb, var(--signal) 9%, transparent), transparent 55%), var(--bg)',
        }}
      >
        <p className="sr-only">Hero</p>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(440px,0.9fr)] lg:gap-12">
            {/* LEFT — h1, copy, CTAs */}
            <div>
              <h1 className="text-balance text-[2.3rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[2.7rem] lg:text-[3.05rem]">
                Get found by the agents <span className="nx-accent-text">doing the buying.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                Nexez puts your business in front of the AI buyer agents shopping for real customers, turning agent conversations into closed sales.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href={appUrl('/create')} className="btn-primary h-11 px-5">
                  List your business
                </a>
                <a href="/how-it-works" className="btn-secondary h-11 px-5">See how it works</a>
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
      <section
        className="border-b border-border bg-white/[0.015]"
        aria-label="Read by every major agent"
        data-section-name="Read by every major agent"
      >
        <p className="sr-only">Read by every major agent</p>
        <div className="mx-auto max-w-7xl px-5 py-10">
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

      {/* PROBLEM */}
      <section
        className="nx-home-reveal-band border-b border-border"
        aria-label="Problem"
        data-section-name="Problem"
        style={{ zIndex: 1 }}
      >
        <p className="sr-only">Problem</p>
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <h2 className="max-w-3xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
              If agents cannot understand you, they cannot recommend you.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              Most sites are built for browsing. Nexez makes your offers readable when AI decides who gets shortlisted.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="nx-tile overflow-hidden p-5" aria-label="Agent discovery flow">
              <div className="relative grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                {discoveryFlow.map(({ title, label, Icon }, index) => (
                  <div key={title} className="contents">
                    <div className="rounded-lg border border-border bg-white/[0.035] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex size-9 items-center justify-center rounded-md border border-border bg-black">
                          <Icon className="size-4 text-[var(--signal)]" />
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          {label}
                        </span>
                      </div>
                      <p className="mt-5 text-sm font-medium tracking-tight">{title}</p>
                    </div>
                    {index < discoveryFlow.length - 1 ? (
                      <div className="hidden items-center justify-center sm:flex">
                        <div className="nx-flow-line" />
                        <ArrowRight className="mx-2 size-4 shrink-0 text-[var(--signal)]" />
                        <div className="nx-flow-line" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {schemaChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-md border border-border bg-black/20 px-3 py-2 text-center font-mono text-[11px] text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {problemCards.map(({ title, copy }) => (
                <div key={title} className="nx-tile p-5">
                  <h3 className="text-sm font-medium tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PINNED STORY CARDS */}
      <section
        className="nx-home-reveal-band--tint-01 border-b border-border"
        aria-label="Value proposition"
        data-section-name="Value proposition"
        data-benefits-section-name="Benefits"
      >
        <p className="sr-only">Value proposition</p>
        <p className="sr-only">Benefits</p>
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <h2 className="max-w-xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
              Keep your website. Add the layer that converts AI traffic.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground md:text-base">
              Your site keeps selling to people. Nexez gives agents the structured version they need to act.
            </p>
            <ul className="mt-7 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              {valueBullets.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-5 pb-0 lg:pb-[34vh]">
            <h3 className="text-lg font-semibold tracking-[-0.015em] md:text-xl">Why businesses choose Nexez</h3>
            {pinnedStories.map(({ title, copy, Icon }, index) => (
              <article
                key={title}
                className="nx-tile min-h-[320px] p-6 transition-colors lg:!sticky lg:min-h-[360px]"
                style={{ top: `${96 + index * 18}px`, zIndex: index + 1 }}
              >
                <div className="flex h-full flex-col justify-between gap-10">
                  <div>
                    <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-black">
                      <Icon className="size-4 text-[var(--signal)]" />
                    </div>
                    <h3 className="mt-6 max-w-xl text-lg font-semibold leading-tight tracking-[-0.015em] md:text-2xl">{title}</h3>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">{copy}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-5">
                    <span className="font-mono text-xs text-muted-foreground">0{index + 1} / 04</span>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
                      {index === 0
                        ? 'Match better intent'
                        : index === 1
                          ? 'Raise confidence'
                          : index === 2
                            ? 'Move buyers forward'
                            : 'Measure revenue'}
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* WHY IT MATTERS */}
      <section
        className="nx-home-reveal-band border-b border-border"
        aria-label="Why it matters"
        data-section-name="Why it matters"
        style={{ zIndex: 2 }}
      >
        <p className="sr-only">Why it matters</p>
        <div className="mx-auto max-w-7xl px-5 py-20">
          <h2 className="max-w-3xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
            AI agents do not just discover businesses. <span className="nx-accent-text">They influence who gets chosen.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Become easier to interpret, compare, and act on when buyer intent is highest.
          </p>
          <div className="mt-10">
            <ReadinessLab />
          </div>
        </div>
      </section>

      {/* ANALYTICS */}
      <section
        className="nx-home-reveal-band border-b border-border"
        aria-label="Analytics"
        data-section-name="Analytics"
        style={{ zIndex: 3 }}
      >
        <p className="sr-only">Analytics</p>
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
            <div>
              <h2 className="max-w-3xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
                See which AI traffic actually converts
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                Know which models arrived, what they wanted, and whether they created pipeline.
              </p>
            </div>
            <ul className="nx-tile grid gap-3 p-5 text-sm text-muted-foreground md:p-6">
              {analyticsBullets.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-10">
            <LiveAgentFeed />
          </div>
        </div>
      </section>

      {/* PRODUCT CAPABILITIES */}
      <section
        className="nx-home-static-band nx-home-reveal-band--tint-015 border-b border-border"
        aria-label="Product capabilities"
        data-section-name="Product capabilities"
        style={{ zIndex: 4 }}
      >
        <p className="sr-only">Product capabilities</p>
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
              Built to help you <span className="nx-accent-text">convert AI-driven demand.</span>
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
      <section
        className="nx-home-static-band border-b border-border"
        aria-label="How it works"
        data-section-name="How it works"
        style={{ zIndex: 5 }}
      >
        <p className="sr-only">How it works</p>
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
              Go from invisible to agent-ready in four steps
            </h2>
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
      <section
        id="simulator"
        className="nx-home-static-band nx-home-reveal-band--tint-02 border-b border-border py-20"
        aria-label="Agent simulator"
        data-section-name="Agent simulator"
        style={{ zIndex: 6 }}
      >
        <p className="sr-only">Agent simulator</p>
        <div className="mx-auto max-w-4xl px-5 text-center">
          <h2 className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
            See how agents read your business
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Ask a buyer question. Watch Nexez resolve offers, prices, and actions instantly.
          </p>
          <div className="mt-8">
            <SimulatorTeaser />
          </div>
        </div>
      </section>

      {/* PUBLIC EXAMPLES */}
      <section
        className="nx-home-static-band border-b border-border py-20"
        aria-label="Public examples"
        data-section-name="Public examples"
        style={{ zIndex: 7 }}
      >
        <p className="sr-only">Public examples</p>
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">Listings agents can discover now.</h2>
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
                  {page.description || 'A structured offer listing built for AI agents.'}
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
              <p className="text-sm text-muted-foreground">No published listings yet. Be the first.</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        className="nx-home-static-band relative overflow-hidden"
        aria-label="Final call to action"
        data-section-name="Final call to action"
        style={{ zIndex: 8 }}
      >
        <p className="sr-only">Final call to action</p>
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-orb nx-orb--purple !opacity-25" style={{ top: 'auto', bottom: '-22rem', left: '50%', transform: 'translateX(-50%)' }} />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 py-24 text-center">
          <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] md:text-[2.75rem]">
            Be the business <span className="nx-accent-text">AI agents choose.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Launch an agent-ready presence in minutes and start measuring AI-driven growth.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={appUrl('/create')} className="btn-primary h-11 px-5">
              Launch your agent listing
            </a>
            <a href="#simulator" className="btn-secondary h-11 px-5">Try the simulator</a>
          </div>
        </div>
      </section>
    </main>
  )
}
