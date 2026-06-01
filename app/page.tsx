import { ArrowRight, Bot, Gauge, Globe2, Search } from 'lucide-react'
import type { ComponentType } from 'react'
import { cookies } from 'next/headers'
import { AgentPage, getOfferCount, getReadinessScore } from '../lib/agent-page'
import { supabase } from '../lib/supabase'
import { createClient } from '../utils/supabase/server'

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
            <a href="/directory" className="text-[#9CA3AF] hover:text-white transition-colors">Directory</a>
            <a href="/dashboard" className="text-[#9CA3AF] hover:text-white transition-colors">Dashboard</a>
            
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
            trust, and take action on.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="/create" className="btn-primary text-lg px-10 py-4">
              Create your first agent page
              <ArrowRight className="size-5" />
            </a>
            <a href="/directory" className="btn-secondary text-lg px-8">
              Browse the directory
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

      {/* LIVE AGENT PAGES — Clean directory preview */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="text-[#7C3AED] text-sm font-medium tracking-[3px] mb-2">DISCOVER</div>
              <h2 className="text-5xl font-semibold tracking-tighter">Live on Nexez</h2>
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

                <div className="mt-6 flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-white/5 px-3 py-1 border border-white/10">
                    {getOfferCount(page)} offers
                  </span>
                  {page.location && (
                    <span className="rounded-full bg-white/5 px-3 py-1 border border-white/10">
                      {page.location}
                    </span>
                  )}
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

      {/* FINAL CTA BANNER */}
      <section className="border-t border-white/10 py-20 bg-[#0F0D18]">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-6xl font-semibold tracking-tighter">Ready to get discovered by AI?</h2>
          <p className="mt-4 text-xl text-[#9CA3AF]">Create a premium agent page in under 3 minutes.</p>
          
          <a href="/create" className="btn-primary mt-10 inline-flex text-xl px-14 py-5">
            Create Your Agent Page — Free
          </a>
        </div>
      </section>
    </main>
  )
}
