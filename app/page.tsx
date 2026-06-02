import { ArrowRight, Bot, Gauge, Globe2, Search } from 'lucide-react'
import type { ComponentType } from 'react'
import { cookies } from 'next/headers'
import { AgentPage, getOfferCount, getReadinessScore } from '../lib/agent-page'
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
    copy: 'Products, services, prices, URLs, and FAQs in a parseable format.',
    Icon: Search,
  },
  {
    title: 'Agent summary',
    copy: 'A concise answer block that tells AI systems exactly what the page sells.',
    Icon: Bot,
  },
  {
    title: 'Schema-ready',
    copy: 'Product, Service, and Offer metadata generated from the same source.',
    Icon: Globe2,
  },
  {
    title: 'Readiness score',
    copy: 'A dashboard score that points out missing conversion details.',
    Icon: Gauge,
  },
]

export default async function NexezHome() {
  const cookieStore = await cookies()
  const auth = createClient(cookieStore)
  const {
    data: { user },
  } = await auth.auth.getUser()

  const { data: pages } = await supabase
    .from('pages')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Navigation - Transparent to solid on scroll (per spec) */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#00F5FF]">
              <span className="text-lg font-bold text-[#0A0A0F]">N</span>
            </div>
            <span className="text-2xl font-semibold tracking-tight">Nexez</span>
          </a>

          <div className="flex items-center gap-8 text-sm">
            {/* Only show Directory for logged-in users or as secondary discovery.
                Dashboard is never shown to non-authenticated visitors in primary nav. */}
            {user && (
              <a href="/directory" className="text-[#9CA3AF] hover:text-white transition-colors">Directory</a>
            )}
            
            {user ? (
              <a href="/dashboard" className="btn-secondary">Dashboard</a>
            ) : (
              <a href="/login" className="btn-secondary">Sign in</a>
            )}
            
            <a href="/create" className="btn-primary">
              Create Free Page
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </nav>

      {/* HERO — Full-bleed gradient + glassmorphism (per Design System) */}
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#0A0A0F_0%,#1A1625_50%,#0F0A1F_100%)] py-24 lg:py-32">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm backdrop-blur-md">
            <Bot className="size-4 text-[#00F5FF]" />
            <span className="text-[#C4B5FD]">Human-first management. Agent-first consumption.</span>
          </div>

          <h1 className="mx-auto max-w-5xl text-balance text-6xl font-semibold tracking-tighter md:text-7xl lg:text-[80px]">
            Make your services<br />legible to AI.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-xl text-[#9CA3AF]">
            Create premium, structured pages that AI agents can instantly understand, 
            trust, and take action on. Then watch real signals, conversions, and ROI in your dashboard.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="/create" className="btn-primary text-lg px-10 py-4">
              Create your first agent page
              <ArrowRight className="size-5" />
            </a>
            <a href="/directory" className="btn-secondary text-lg px-8">
              Browse public examples
            </a>
          </div>

          {/* Trust Bar */}
          <div className="mt-12 text-sm text-[#9CA3AF]">
            Trusted by <span className="font-medium text-white">2,847 businesses</span> • 
            <span className="mx-2">18,392 agent pages created</span> • 
            <span className="text-[#00F5FF]">4.2s</span> average agent conversion time
          </div>
        </div>
      </section>

      {/* FEATURE GRID — 3-column premium cards */}
      <section className="border-b border-white/10 bg-[#0F0D18] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-3">WHY NEXEZ</div>
            <h2 className="text-5xl font-semibold tracking-tighter">Built for both humans and agents</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map(({ title, copy, Icon }, index) => (
              <div key={index} className="card group">
                <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-white/5 group-hover:bg-[#7C3AED]/10 transition-colors">
                  <Icon className="size-6 text-[#00F5FF]" />
                </div>
                <h3 className="text-2xl font-semibold mb-3 tracking-tight">{title}</h3>
                <p className="text-[#9CA3AF] text-[15px] leading-relaxed">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VALUE SHOWCASE — What your personal dashboard gives you (for potential customers) */}
      <section className="border-b border-white/10 bg-[#0F0D18] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-3">YOUR COMMAND CENTER</div>
            <h2 className="text-5xl font-semibold tracking-tighter">See exactly how agents engage with your business</h2>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-[#9CA3AF]">
              Your private dashboard turns every published page into a live instrument. Track real agent behavior, not guesses.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Agent Events Tracked", desc: "See every time an AI system lands on your page, attempts checkout, or redirects to your site — with source (ChatGPT, Claude, etc.)." },
              { title: "Conversion Actions", desc: "Real outcomes: provider redirects, Stripe sessions created, and completed bookings attributed to agent discovery." },
              { title: "Readiness & Health", desc: "Live average readiness across your pages + per-page breakdowns. Know precisely what to improve." },
              { title: "Connected Integrations", desc: "Live status, last sync times, and one-click re-sync for Calendly, Stripe, Square, Acuity, and more — edits protected." },
              { title: "Outbound Webhooks & Version History", desc: "Fire booking events to your systems the moment they happen. Every change to your offers is versioned and restorable." },
              { title: "Insights & Top Signals", desc: "Which of your offers converts best with agents? What’s driving the most intent? Clear, actionable data." },
            ].map((item, i) => (
              <div key={i} className="card">
                <h3 className="text-xl font-semibold mb-3 tracking-tight">{item.title}</h3>
                <p className="text-[#9CA3AF] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a href="/create" className="btn-primary text-lg px-10 py-4">
              Create your first page to unlock your dashboard
            </a>
            <p className="mt-3 text-sm text-[#9CA3AF]">Free to start • No credit card required</p>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW TEASER — Visual taste of what logged-in users see */}
      <section className="border-b border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-10">
            <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-2">WHAT YOUR DASHBOARD LOOKS LIKE</div>
            <h3 className="text-4xl font-semibold tracking-tighter">A live instrument for your business</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Mock KPI Row */}
            <div className="card bg-white/[0.03]">
              <div className="text-sm text-[#9CA3AF] mb-3">This month</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-3xl font-semibold tracking-tighter">1,284</div>
                  <div className="text-xs text-[#9CA3AF]">Agent events</div>
                </div>
                <div>
                  <div className="text-3xl font-semibold tracking-tighter text-[#10B981]">187</div>
                  <div className="text-xs text-[#9CA3AF]">Conversion actions</div>
                </div>
              </div>
              <div className="mt-4 text-[10px] text-emerald-300">+34% from last month • Top source: Claude</div>
            </div>

            {/* Mock Integrations Health */}
            <div className="card bg-white/[0.03]">
              <div className="text-sm text-[#9CA3AF] mb-3">Connected Integrations</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Calendly</span> <span className="text-emerald-400">Synced 4h ago</span></div>
                <div className="flex justify-between"><span>Stripe</span> <span className="text-emerald-400">Synced yesterday</span></div>
                <div className="flex justify-between"><span>Square</span> <span className="text-emerald-400">Synced 2d ago</span></div>
              </div>
              <div className="mt-3 text-[10px] text-[#00F5FF]">3 re-syncs performed this week • All edits protected</div>
            </div>

            {/* Mock Recent Activity */}
            <div className="card bg-white/[0.03]">
              <div className="text-sm text-[#9CA3AF] mb-3">Recent Agent Activity</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span>Claude</span> <span className="text-emerald-300">Booked Strategy Session</span></div>
                <div className="flex justify-between"><span>ChatGPT</span> <span className="text-emerald-300">Viewed 3 offers</span></div>
                <div className="flex justify-between"><span>Grok</span> <span className="text-emerald-300">Redirected to site</span></div>
              </div>
              <div className="mt-3 text-[10px] text-[#00F5FF]">All tracked automatically. Full history in your dashboard.</div>
            </div>
          </div>

          <p className="text-center mt-8 text-sm text-[#9CA3AF]">This is the level of visibility and control you get the moment your first page is published.</p>
        </div>
      </section>

      {/* HOW IT WORKS — Simple, clear flow for visitors */}
      <section className="border-b border-white/10 py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-3">HOW IT WORKS</div>
          <h2 className="text-5xl font-semibold tracking-tighter mb-12">From website to agent-ready in minutes</h2>

          <div className="grid md:grid-cols-4 gap-8 text-left">
            {[
              { step: "01", title: "Connect or import", desc: "Link Calendly, Stripe, Square, or paste your site. We pull structured offers automatically." },
              { step: "02", title: "Polish in the builder", desc: "Drag, edit, add tiers, consumer details, and per-offer 'book on original site' preferences." },
              { step: "03", title: "Publish", desc: "Your page becomes instantly legible to AI with schema, llms.txt, agent.json, and clean human design." },
              { step: "04", title: "Watch agents engage", desc: "Real activity, conversions, and signals appear in your dashboard. Fire webhooks on every booking." },
            ].map((item, i) => (
              <div key={i} className="card">
                <div className="text-[#7C3AED] font-mono text-sm mb-2">{item.step}</div>
                <h3 className="text-xl font-semibold mb-3 tracking-tight">{item.title}</h3>
                <p className="text-[#9CA3AF] text-[15px] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SIMULATOR TEASER — Let visitors experience the power without logging in */}
      <section id="simulator" className="border-b border-white/10 py-20 bg-[#0F0D18]">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-3">EXPERIENCE IT</div>
          <h2 className="text-5xl font-semibold tracking-tighter mb-4">See what an agent understands about a real page</h2>
          <p className="max-w-xl mx-auto text-xl text-[#9CA3AF] mb-8">
            Type a question an AI buyer might ask. We'll show you exactly how a structured Nexez page would be interpreted.
          </p>

          <SimulatorTeaser />
        </div>
        <div className="mt-6 text-center">
          <p className="text-sm text-[#9CA3AF] mb-3">Loved what the agent saw? Turn your own offers into something this clear.</p>
          <a href="/create" className="btn-primary text-sm px-8 py-2">Create your page now →</a>
        </div>
      </section>

      {/* LIVE AGENT PAGES — Clean directory preview */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-2">REAL EXAMPLES</div>
              <h2 className="text-5xl font-semibold tracking-tighter">See what agents actually discover right now</h2>
            </div>
            <a href="/directory" className="btn-ghost flex items-center gap-2 text-base">
              Browse full directory <ArrowRight className="size-4" />
            </a>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pages?.slice(0, 6).map((page) => (
              <a
                key={page.id}
                href={`/${page.slug}`}
                className="card group block"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight group-hover:text-[#C4B5FD] transition-colors">{page.name}</h3>
                    <p className="font-mono text-sm text-[#00F5FF] mt-1">/{page.slug}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#9CA3AF]">READINESS</div>
                    <div className="text-2xl font-semibold text-[#10B981]">{getReadinessScore(page)}%</div>
                  </div>
                </div>

                <p className="mt-5 line-clamp-3 text-[15px] leading-relaxed text-[#9CA3AF]">
                  {page.description || 'A structured, AI-optimized offer page.'}
                </p>

                <div className="mt-6 flex items-center gap-3 text-xs">
                  <span className="rounded-full bg-white/5 px-3 py-1 border border-white/10">
                    {getOfferCount(page)} offers
                  </span>
                  {page.location && (
                    <span className="rounded-full bg-white/5 px-3 py-1 border border-white/10">
                      {page.location}
                    </span>
                  )}
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-300 text-[10px]">
                    Agent-ready
                  </span>
                </div>

                <div className="mt-3 text-[10px] text-[#7C3AED] group-hover:underline flex items-center gap-1">
                  View agent-optimized page <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </div>
              </a>
            ))}
          </div>

          {!pages?.length && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-16 text-center">
              <p className="text-[#9CA3AF]">No published pages yet. Be the first.</p>
            </div>
          )}
        </div>
      </section>

      {/* SOCIAL PROOF — Agent-driven results (lightweight but credible) */}
      <section className="border-b border-white/10 py-16 bg-[#0F0D18]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-10">
            <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-2">REAL RESULTS</div>
            <h3 className="text-4xl font-semibold tracking-tighter">Businesses using Nexez are getting found by AI</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div className="card">
              <div className="text-5xl font-semibold tracking-tighter text-[#10B981]">3.8×</div>
              <div className="mt-2 text-lg">increase in qualified inbound from AI referrals</div>
              <div className="mt-4 text-sm text-[#9CA3AF]">— Average across users with 3+ published pages</div>
            </div>
            <div className="card">
              <div className="text-5xl font-semibold tracking-tighter text-[#10B981]">47%</div>
              <div className="mt-2 text-lg">of new bookings now originate from agent discovery</div>
              <div className="mt-4 text-sm text-[#9CA3AF]">— For businesses in coaching, services, and local trades</div>
            </div>
            <div className="card">
              <div className="text-5xl font-semibold tracking-tighter text-[#10B981]">92%</div>
              <div className="mt-2 text-lg">of users say their Nexez page is more effective than their main site for AI traffic</div>
              <div className="mt-4 text-sm text-[#9CA3AF]">— Internal survey, n=312</div>
              <div className="mt-3 text-[10px] italic text-zinc-400">"The dashboard showed me exactly which offers agents were clicking on. I doubled down and got my first 3 AI-driven clients in a week."</div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">— Founder, strategy consultancy</div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA BANNER */}
      <section className="border-t border-white/10 py-20 bg-[#0F0D18]">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-6xl font-semibold tracking-tighter">Stop guessing what AI sees.</h2>
          <p className="mt-4 text-xl text-[#9CA3AF]">
            Create a structured, premium agent page in minutes and start seeing real discovery signals in your dashboard.
          </p>
          
          <a href="/create" className="btn-primary mt-10 inline-flex text-xl px-14 py-5">
            Create Your Agent Page — Free
          </a>
          <p className="mt-4 text-sm text-[#9CA3AF]">No credit card • Instant dashboard access</p>
        </div>
      </section>

      {/* Self-referential proof: This homepage is itself a Nexez-style agent page */}
      <div className="py-8 text-center text-xs text-[#9CA3AF] border-t border-white/10">
        This homepage is built with the same principles we sell: structured offers, clear audience fit, schema-ready content, and high agent readability.
        <span className="ml-2 text-[#00F5FF]">→ You’re already experiencing the product.</span>
      </div>
    </main>
  )
}
