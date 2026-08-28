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
import { safeJsonScript } from '../lib/safe-json'

// Marketing homepage: fully static (fast on nexez.ai). The always-live listing
// directory lives on /discovery.
const metaTitle = 'Nexez - Commerce for AI agents'
const metaDescription =
  'Help customers and AI assistants buy from your business while your prices, requirements, and rules stay under your control.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  keywords: [
    'AI commerce',
    'AI shopping agents',
    'service commerce',
    'AI-ready business',
    'agent checkout',
    'service pricing',
    'recurring services',
  ],
  alternates: {
    canonical: marketingUrl('/'),
  },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/'),
    title: metaTitle,
    description: metaDescription,
  },
}

type Feature = {
  title: string
  copy: string
  Icon: ComponentType<{ className?: string }>
}

const workflow = [
  {
    step: '01',
    title: 'Tell Nexez what you sell',
    copy: 'Bring in your services, prices, and the choices buyers can make. Start with what your business already offers.',
  },
  {
    step: '02',
    title: 'Set your rules',
    copy: 'Choose what buyers need to tell you, what changes the price, what work you accept, and which services can repeat.',
  },
  {
    step: '03',
    title: 'Let buyers choose',
    copy: 'A person or AI assistant can pick a service and provide the details your business needs before moving forward.',
  },
  {
    step: '04',
    title: 'Nexez checks the order',
    copy: 'Nexez checks the details, price, and fit before money moves, then gives the buyer the right next step.',
  },
]

const keyFeatures: Feature[] = [
  {
    title: 'Pricing and options',
    copy: 'Set your starting price and how buyer choices, add-ons, or quantities change what they pay.',
    Icon: TrendingUp,
  },
  {
    title: 'Buyer questions',
    copy: 'Ask for the details you need before an order moves forward, from size and quantity to preferences or service type.',
    Icon: Search,
  },
  {
    title: 'Merchant rules',
    copy: 'Decide which requests can proceed, which need your attention, and which should stop before payment.',
    Icon: ShieldCheck,
  },
  {
    title: 'Repeat services',
    copy: 'Offer ongoing services with the cadence and price you choose, while buyers keep a clear path to manage them.',
    Icon: RefreshCw,
  },
  {
    title: 'Agent Simulator',
    copy: 'Run a real buying scenario and see what Nexez asks, what it can work out, and what happens next.',
    Icon: Bot,
  },
  {
    title: 'Clear order records',
    copy: 'Keep the chosen service, buyer details, price, and approvals tied together so the sale stays understandable.',
    Icon: Handshake,
  },
  {
    title: 'Copilot',
    copy: 'Get help tightening offers and spotting missing details while the prices and business rules you set stay authoritative.',
    Icon: Sparkles,
  },
  {
    title: 'Your brand, your domain',
    copy: 'Publish on Nexez or your own domain so buyers and AI assistants can reach a storefront that still feels like your business.',
    Icon: Globe2,
  },
  {
    title: 'Trust context',
    copy: 'Keep policies, proof, and verification context close to the offer so buyers and agents have more to judge the purchase by.',
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
    title: 'Your prices stay yours.',
    copy: 'You set the price and the choices that can change it. Nexez follows those terms instead of letting AI invent a number.',
    Icon: TrendingUp,
  },
  {
    title: 'Bad-fit orders can stop before payment.',
    copy: 'Set requirements for the work you will accept. Nexez can let a request proceed, flag it for your attention, or stop it when it falls outside your rules.',
    Icon: ShieldCheck,
  },
  {
    title: 'Repeat work can stay repeatable.',
    copy: 'For services that happen again and again, you can offer the cadence and price that make sense for your business instead of rebuilding each sale by hand.',
    Icon: RefreshCw,
  },
  {
    title: 'AI gets a buying path, not control of your business.',
    copy: 'Customers and AI assistants can choose from what you actually offer, answer the questions you require, and move forward only within the boundaries you set.',
    Icon: Bot,
  },
]

const problemCards = [
  {
    title: 'Your website describes the business',
    copy: 'Great for people browsing. Harder for an AI assistant that needs exact prices, choices, requirements, and a safe next step.',
  },
  {
    title: 'Missing details create guessing',
    copy: 'When the buying rules are unclear, an assistant can misunderstand the offer or stop before the sale ever reaches you.',
  },
  {
    title: 'Nexez turns your rules into the buying path',
    copy: 'Your offers, buyer questions, pricing, and limits stay together so people and AI can shop from the same business truth.',
  },
]

const valueBullets = [
  'Prices and options you set',
  'Buyer details before checkout',
  'Rules that can stop a bad fit',
  'Repeat services on your terms',
]

const analyticsBullets = [
  'See which agents and offers are creating demand',
  'Understand what buyers were trying to purchase',
  'Follow qualified activity toward checkout and sales',
]

const discoveryFlow = [
  { title: 'Your business', label: 'Your terms', Icon: Globe2 },
  { title: 'Nexez', label: 'Checks details', Icon: Sparkles },
  { title: 'Buyer or AI', label: 'Right next step', Icon: Bot },
]

const commerceChips = ['Offers', 'Buyer details', 'Pricing', 'Rules']

const homeStructuredData = buildPlatformStructuredData()

export default function NexezHome() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonScript(homeStructuredData) }}
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
        aria-label="Built for the AI assistants buyers use"
        data-section-name="Built for the AI assistants buyers use"
      >
        <div className="mx-auto max-w-7xl px-5 py-10">
          <p className="mb-7 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Built for the AI assistants buyers use
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
              AI can help someone buy from you. <span className="nx-accent-text">It still needs your rules.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              A buyer may know what they want, but an AI assistant still needs clear offers, prices, and requirements.
              Nexez keeps those answers clear before the sale moves forward.
            </p>
            <div className="mt-10 hidden aspect-square w-full lg:block">
              <KnowledgeGraph />
            </div>
          </div>
          <div className="grid gap-4">
            <div className="nx-tile overflow-hidden p-5" role="group" aria-label="Nexez buying flow">
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
                {commerceChips.map((chip) => (
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
        aria-label="Merchant control"
        data-section-name="Merchant control"
        data-benefits-section-name="Benefits"
        style={{ position: 'relative', zIndex: 2 }}
      >
        <p className="sr-only">Merchant control</p>
        <p className="sr-only">Benefits</p>
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <h2 className="max-w-xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[2.15rem]">
              Let AI sell what you offer. <span className="nx-accent-text">Keep control of how you sell it.</span>
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground md:text-base">
              Nexez gives customers and AI assistants a clear buying path. They cannot change your prices,
              ignore your requirements, or promise work you did not approve.
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
            <h3 className="text-lg font-semibold tracking-[-0.015em] md:text-xl">What stays under your control</h3>
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
                        ? 'Your pricing'
                        : index === 1
                          ? 'Your limits'
                          : index === 2
                            ? 'Your cadence'
                            : 'Your business'}
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
            A good AI sale should follow <span className="nx-accent-text">the same business you run.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Nexez connects the buyer&apos;s request to your offer, required details, price, and purchase rules.
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
                See where agent demand is coming from.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                Nexez gives you visibility into agent activity, buyer intent, and the offers that lead toward checkout, so you can see what people are actually trying to buy.
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
              The controls behind a <span className="nx-accent-text">safer AI sale.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              You do not need to understand the technology underneath. You just need to tell Nexez how your business works.
            </p>
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
              Four simple steps. <span className="nx-accent-text">Your rules stay in charge.</span>
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
          <div className="mt-7">
            <a href="/how-it-works" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
              See the full buying journey
              <ArrowRight className="size-4" />
            </a>
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
            Run a buying scenario before a real buyer does.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            See what an AI assistant understands, what details are missing, and whether the request can move forward.
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
            Make your business easier for <span className="nx-accent-text">people and AI to buy from.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Set up what you sell, how it should be bought, and the rules Nexez should follow when the next buyer arrives.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={appUrl('/create')} className="btn-primary h-11 px-5">
              List your offers
            </a>
            <a href="/how-it-works" className="btn-secondary h-11 px-5">See how it works</a>
          </div>
        </div>
      </section>
    </main>
  )
}
