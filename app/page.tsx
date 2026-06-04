import { ArrowRight, Bot, Gauge, Globe2, Search } from 'lucide-react'
import type { ComponentType } from 'react'
import { cookies } from 'next/headers'
import { AgentPage, PUBLIC_PAGE_SELECT, getOfferCount, getReadinessScore } from '../lib/agent-page'
import { supabase } from '../lib/supabase'
import { createClient } from '../utils/supabase/server'
import { SimulatorTeaser } from '../components/SimulatorTeaser'

type Feature = {
  title: string
  copy: string
  Icon: ComponentType<{ className?: string }>
}

const features: Feature[] = [
  {
    title: 'Structured offers',
    copy: 'Services, products, pricing, FAQs, and action links formatted for agents instead of buried in a busy site.',
    Icon: Search,
  },
  {
    title: 'Agent summary',
    copy: 'A concise buyer context block that says who you help, what you sell, and what the next step is.',
    Icon: Bot,
  },
  {
    title: 'Schema-ready',
    copy: 'JSON-LD, llms.txt, agent.json, MCP, and clean HTML generated from the same page data.',
    Icon: Globe2,
  },
  {
    title: 'Readiness score',
    copy: 'A practical score for missing CTAs, weak descriptions, unclear pricing, and agent parsing gaps.',
    Icon: Gauge,
  },
]

const workflow = [
  { step: '01', title: 'Import', copy: 'Start from your website, Calendly, Stripe, Square, Shopify, or CSV.' },
  { step: '02', title: 'Edit', copy: 'Polish offers, tiers, buyer fit, booking rules, and FAQs in the builder.' },
  { step: '03', title: 'Publish', copy: 'Launch a lightweight page built for crawlers, agents, and direct action.' },
  { step: '04', title: 'Measure', copy: 'Track agent visits, queries, conversion actions, and readiness over time.' },
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
      <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-border bg-white text-sm font-semibold text-black">
              N
            </div>
            <span className="text-sm font-medium tracking-tight">Nexez</span>
          </a>

          <div className="flex items-center gap-2 text-sm">
            {user ? (
              <a href="/dashboard" className="btn-secondary hidden h-9 px-3 sm:inline-flex">Overview</a>
            ) : (
              <a href="/login" className="btn-secondary hidden h-9 px-3 sm:inline-flex">Sign in</a>
            )}
            <a href="/create" className="btn-primary h-9 px-3">
              Create page
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </nav>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.8fr)] lg:items-center lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
              <Bot className="size-3.5 text-cyan-300" />
              AI-readable business pages
            </div>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              The page AI agents can actually use.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Nexez creates a clean agent page next to your main website: structured offers, schema, booking links,
              and analytics for how AI systems discover and act on your business.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/create" className="btn-primary h-11 px-5">
                Create your first page
                <ArrowRight className="size-4" />
              </a>
              <a href="/simulator" className="btn-secondary h-11 px-5">Test agent parsing</a>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-xs text-muted-foreground">
              <span>JSON-LD</span>
              <span>llms.txt</span>
              <span>agent.json</span>
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section className="border-b border-border py-18">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">What Nexez creates</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                A low-friction surface for agentic discovery.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Human website stays intact. Agent page becomes the lightweight, structured layer built for parsing and action.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {features.map(({ title, copy, Icon }) => (
              <div key={title} className="card">
                <div className="mb-5 flex size-9 items-center justify-center rounded-md border border-border bg-black">
                  <Icon className="size-4 text-cyan-300" />
                </div>
                <h3 className="text-lg font-medium tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.7fr_1fr] lg:items-start">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Workflow</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">From website to agent-ready.</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              The product is intentionally boring where it should be: import, edit, publish, measure. The magic is in the structure agents receive.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {workflow.map((item) => (
              <div key={item.step} className="rounded-lg border border-border bg-white/[0.03] p-5">
                <p className="font-mono text-xs text-muted-foreground">{item.step}</p>
                <h3 className="mt-3 text-xl font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="simulator" className="border-b border-border bg-white/[0.02] py-16">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <p className="text-sm font-medium text-muted-foreground">Agent simulator</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
            Preview what an agent understands.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Test a buyer-style query and see how a structured page turns offers, CTAs, and schema into an answer.
          </p>
          <div className="mt-8">
            <SimulatorTeaser />
          </div>
        </div>
      </section>

      <section className="border-b border-border py-16">
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
              <a key={page.id} href={`/${page.slug}`} className="card group block">
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
                  {page.description || 'A structured, AI-optimized offer page.'}
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

      <section className="py-18">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] md:text-6xl">Stop guessing what AI sees.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Create a crawlable, structured agent page in minutes and start measuring real discovery signals.
          </p>
          <a href="/create" className="btn-primary mt-8 h-11 px-5">
            Create your agent page
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>
    </main>
  )
}

function ProductPreview() {
  return (
    <div className="rounded-xl border border-border bg-white/[0.03] p-2 shadow-2xl shadow-black">
      <div className="rounded-lg border border-border bg-black">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red-400" />
            <span className="size-2 rounded-full bg-amber-400" />
            <span className="size-2 rounded-full bg-emerald-400" />
          </div>
          <span className="font-mono text-xs text-muted-foreground">nexez.app/acme</span>
        </div>

        <div className="grid gap-0 md:grid-cols-[0.9fr_1fr]">
          <div className="border-b border-border p-5 md:border-b-0 md:border-r">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Agent page</p>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Acme Strategy Studio</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Executive strategy sessions, retainers, and audits for B2B founders.
            </p>
            <div className="mt-5 space-y-2">
              {['Strategy Session - $450', 'Retainer - from $3,000/mo', 'SEO Audit - fixed scope'].map((item) => (
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
              <p className="text-sm font-medium text-emerald-100">Agent-ready</p>
              <p className="mt-1 text-xs leading-5 text-emerald-100/80">Clear pricing, buyer fit, schema, and booking action.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
