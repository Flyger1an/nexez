import {
  ArrowRight,
  Bot,
  Globe2,
  TrendingUp,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Search,
  RefreshCw,
  Handshake,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { Metadata } from 'next'
import { appUrl, marketingUrl } from '../lib/site'
import { buildPlatformStructuredData } from '../lib/platform-agent-manifest'
import { SimulatorTeaser } from '../components/SimulatorTeaser'
import { AgentXray } from '../components/home/AgentXray'
import { KnowledgeGraph } from '../components/home/KnowledgeGraph'
import { ReadinessLab } from '../components/home/ReadinessLab'
import { LiveAgentFeed } from '../components/home/LiveAgentFeed'
import { ScrollProgress } from '../components/home/ScrollProgress'
import { ShaderBackdrop } from '../components/home/ShaderBackdrop'

// Marketing homepage: fully static (fast on nexez.ai). The always-live listing
// directory lives on /discovery.

// Title/description stay inherited from the root layout; this pins the canonical
// (and og:url) to the marketing host — metadataBase resolves to nexez.app.
export const metadata: Metadata = {
  alternates: {
    canonical: marketingUrl('/'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/'),
    title: 'Nexez - Listings built for AI agents',
    description:
      'A structured storefront AI agents can read, trust, and buy from. Host it on your domain or Nexez.',
  },
}

type Feature = {
  title: string
  copy: string
  Icon: ComponentType<{ className?: string }>
}

const workflow = [
  { step: '01', title: 'Connect', copy: 'Import offers, pricing, and availability from your site, Stripe, Shopify, Calendly, or Square.' },
  { step: '02', title: 'Structure', copy: 'Nexez maps every offer to schema agents trust: JSON-LD, llms.txt, agent.json, and MCP.' },
  { step: '03', title: 'Publish', copy: 'Ship a crawlable, transactable listing on your own domain or a nexez link.' },
  { step: '04', title: 'Sell', copy: 'Agents discover, compare, and check out. You watch the revenue land.' },
]

const keyFeatures: Feature[] = [
  {
    title: 'Copilot',
    copy: 'Tighten pricing, offers, and proof for the way agents actually weigh and decide.',
    Icon: Sparkles,
  },
  {
    title: 'Agent Simulator',
    copy: 'Preview how ChatGPT, Claude, and Perplexity read and buy from your listing before you ever publish.',
    Icon: Bot,
  },
  {
    title: 'Competitor Analysis',
    copy: 'See how agents stack your offer against rivals, and exactly where you win or lose the comparison.',
    Icon: Search,
  },
  {
    title: 'Revenue Analytics',
    copy: 'Attribute pipeline and sales to the exact agent, query, and offer that produced them.',
    Icon: TrendingUp,
  },
  {
    title: 'Custom Domains',
    copy: 'Publish on your own domain, so agents and buyers land on a brand they already trust.',
    Icon: Globe2,
  },
  {
    title: 'Trust Score',
    copy: 'Turn reviews, policies, and reliability into quality signals agents weigh before they buy.',
    Icon: ShieldCheck,
  },
]

// Hero stat ticker (the X-Ray instrument's "instrument readout" framing).
const stats = [
  { value: '<200ms', label: 'Agent-ready load' },
  { value: '19+', label: 'AI crawlers welcomed' },
  { value: '5+', label: 'Structured formats' },
  { value: 'Live', label: 'Conversion analytics' },
]

// Agents that read structured pages - monogram lockups for the marquee.
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
    title: 'Set it once. Sell on autopilot.',
    copy: 'Configure your offers once. Your listing stays live, structured, and agent-ready around the clock, no upkeep required.',
    Icon: Sparkles,
  },
  {
    title: 'Your listing never goes stale.',
    copy: 'Connect Stripe, Shopify, your calendar, or store, and prices, availability, and offers refresh the instant anything changes. No agent ever sees an old price.',
    Icon: RefreshCw,
  },
  {
    title: 'Let agents close deals for you.',
    copy: 'Set your floor and your terms once. Nexez negotiates with buyer agents on your behalf and alerts you the second a sale lands.',
    Icon: Handshake,
  },
  {
    title: 'One listing, every agent.',
    copy: 'Publish once and get found by ChatGPT, Claude, Perplexity, and every major buyer agent. No per-platform busywork, no rebuilding for each one.',
    Icon: Bot,
  },
]

const problemCards = [
  { title: 'Websites hide intent', copy: 'Menus, popups, and vague copy bury the facts agents need to say yes.' },
  { title: 'Agents need structure', copy: 'Offers, prices, proof, policies, and actions must be explicit, or the agent moves on.' },
  { title: 'Nexez makes you legible', copy: 'One clean layer agents can parse, compare, and transact with.' },
]

const valueBullets = [
  'Structured offers',
  'Clear pricing and proof',
  'Agent-ready next steps',
  'Conversion analytics',
]

const analyticsBullets = [
  'Attribute pipeline and sales to the exact agent and offer',
  'Read the buyer intent behind every discovery',
  'Track comparisons, drop-off, and conversion by model',
]

const discoveryFlow = [
  { title: 'Website', label: 'Human-first', Icon: Globe2 },
  { title: 'Nexez layer', label: 'Structured', Icon: Sparkles },
  { title: 'Agent action', label: 'Book or buy', Icon: Bot },
]

const schemaChips = ['Offers', 'Pricing', 'Proof', 'Actions']

const homeStructuredData = buildPlatformStructuredData()

export default function NexezHome() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeStructuredData).replace(/</g, '\\u003c') }}
      />
      <ScrollProgress />
      {/* HERO + MARQUEE share one smoke field that bleeds across both */}
      <div className="relative overflow-hidden" style={{ background: 'var(--bg)' }}>
        <ShaderBackdrop />
        {/* HERO - text + CTAs on the left, the draggable Agent X-Ray prominent on the right */}
        <section
          className="relative z-10"
          aria-label="Hero"
          data-section-name="Hero"
          style={{
            background:
              'radial-gradient(120% 75% at 50% -12%, color-mix(in srgb, var(--signal) 9%, transparent), transparent 55%)',
          }}
        >
          <p className="sr-only">Hero</p>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(440px,0.9fr)] lg:gap-12">
            {/* LEFT - h1, copy, CTAs */}
            <div>
              <h1 className="text-balance text-[2.3rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[2.7rem] lg:text-[3.05rem]">
                Get found by the agents <span className="nx-accent-text">doing the buying.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                AI agents already shop on behalf of real customers. Nexez makes your business the one they find, compare, and buy from.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href={appUrl('/create')} className="btn-primary h-11 px-5">
                  List your offers
                </a>
                <a href="/how-it-works" className="btn-secondary h-11 px-5">See how it works</a>
              </div>

              {/* stat ticker - compact, tucked under the CTAs beside the X-Ray */}
              <div className="mt-7 flex max-w-xl overflow-hidden rounded-[11px] border border-border" style={{ background: 'var(--ov-02)' }}>
                {stats.map((s, i) => (
                  <div key={s.label} className={`flex-1 px-3 py-2.5 ${i < stats.length - 1 ? 'border-r border-border' : ''}`}>
                    <div className="font-display text-base font-bold tracking-[-0.02em] sm:text-lg">{s.value}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT - the draggable X-Ray gets its own prominent space */}
            <AgentXray />
          </div>
        </div>
      </section>

      {/* AGENT LOGO MARQUEE */}
      <section
        className="relative z-10"
        aria-label="Transacts with every major agent"
        data-section-name="Transacts with every major agent"
      >
        <div className="mx-auto max-w-7xl px-5 py-10">
          <p className="mb-7 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Transacts with every major agent
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
      </div>

      {/* PROBLEM */}
      <section
        className="nx-home-reveal-band border-b border-border"
        aria-label="Problem"
        data-section-name="Problem"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <p className="sr-only">Problem</p>
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start" data-reveal>
          <div>
            <h2 className="max-w-3xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
              Your storefront was built for human eyes. <span className="nx-accent-text">The buyer is now a machine.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              Agents don&apos;t scroll, squint, or hunt through tabs. They parse. If your prices, offers, and checkout aren&apos;t machine-legible, the agent moves on to a competitor it can actually transact with, and you never see the lost sale.
            </p>
            <div className="mt-10 hidden aspect-square w-full lg:block">
              <KnowledgeGraph />
            </div>
          </div>
          <div className="grid gap-4">
            <div className="nx-tile overflow-hidden p-5" aria-label="Agent discovery flow">
              <div className="relative grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
                {discoveryFlow.map(({ title, label, Icon }, index) => (
                  <div key={title} className="contents">
                    <div className="flex h-full flex-col rounded-lg border border-border bg-white/[0.035] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-black">
                          <Icon className="size-4 text-[var(--signal)]" />
                        </div>
                        <span className="text-right font-mono text-[10px] uppercase leading-[1.5] tracking-[0.14em] text-muted-foreground">
                          {label}
                        </span>
                      </div>
                      <p className="mt-auto whitespace-nowrap pt-5 text-sm font-medium tracking-tight">{title}</p>
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
        style={{ position: 'relative', zIndex: 2 }}
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
                        ? 'Set and forget'
                        : index === 1
                          ? 'Always in sync'
                          : index === 2
                            ? 'Rules + alerts'
                            : 'Built-in reach'}
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
        style={{ position: 'relative', zIndex: 2 }}
      >
        <p className="sr-only">Why it matters</p>
        <div className="mx-auto max-w-7xl px-5 py-20" data-reveal>
          <h2 className="max-w-3xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
            The clearer you are, <span className="nx-accent-text">the more you sell.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Your listing resolves a buyer&apos;s intent into a confirmed order: pricing, proof, and a checkout the agent can call. Zero ambiguity.
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
        style={{ position: 'relative', zIndex: 3 }}
      >
        <p className="sr-only">Analytics</p>
        <div className="mx-auto max-w-7xl px-5 py-20" data-reveal>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
            <div>
              <h2 className="max-w-3xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
                See exactly which agents drive revenue.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                Every agent visit, query, comparison, and checkout, attributed. Know which models bring buyers, what they searched, and which sessions became sales.
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
        className="nx-home-static-band nx-home-reveal-band--tint-015 border-b border-border overflow-hidden"
        aria-label="Product capabilities"
        data-section-name="Product capabilities"
        style={{ position: 'relative', zIndex: 4 }}
      >
        <p className="sr-only">Product capabilities</p>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--signal) 7%, transparent) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            WebkitMaskImage: 'radial-gradient(110% 75% at 50% 8%, #000, transparent 72%)',
            maskImage: 'radial-gradient(110% 75% at 50% 8%, #000, transparent 72%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
              Everything you need to <span className="nx-accent-text">convert agent demand.</span>
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {keyFeatures.map(({ title, copy, Icon }) => (
              <div key={title} data-reveal className="card flex items-start gap-3">
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
              Four steps to a business agents can buy from.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflow.map((item, i) => (
              <div key={item.step} data-reveal className="nx-tile p-5">
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
        <div className="mx-auto max-w-4xl px-5 text-center" data-reveal>
          <h2 className="text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
            Ask what a buyer would. Watch the agent answer with your offers.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Test your listing against real buyer intent, the same way ChatGPT, Claude, and Perplexity will read it in the wild.
          </p>
          <div className="mt-8">
            <SimulatorTeaser />
          </div>
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
        <div className="relative z-10 mx-auto max-w-3xl px-5 py-24 text-center" data-reveal>
          <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] md:text-[2.75rem]">
            Be the business <span className="nx-accent-text">the agent buys from.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Stand up a structured, transactable listing in minutes, and turn AI discovery into revenue you can measure.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={appUrl('/create')} className="btn-primary h-11 px-5">
              Deploy your listing
            </a>
            <a href="/support" className="btn-secondary h-11 px-5">Talk to us</a>
          </div>
        </div>
      </section>
    </main>
  )
}
