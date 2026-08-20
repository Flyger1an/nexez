import type { Metadata } from 'next'
import { ArrowRight, Bot, CheckCircle2 } from 'lucide-react'
import { appUrl, marketingUrl } from '../../lib/site'
import { useCases } from '../../lib/marketing-content'
import { getUseCaseCommerceStory } from '../../lib/use-case-commerce-story'

export const metadata: Metadata = {
  title: 'Use Cases — Sell Through AI on Your Terms',
  description:
    'See how consultants, agencies, coaches, local service businesses, software teams, and marketplaces can use Nexez to turn buyer requests into clear next steps without giving up merchant control.',
  alternates: {
    canonical: marketingUrl('/use-cases'),
  },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/use-cases'),
    title: 'Use Cases — Sell Through AI on Your Terms',
    description:
      'See how different businesses use Nexez to collect buyer details, apply their own rules, and move the right requests toward booking or payment.',
  },
}

const sharedSteps = [
  ['Buyer asks', 'A person or AI assistant describes what they need in normal language.'],
  ['You set the rules', 'Your offers, prices, required details, and acceptance rules stay yours.'],
  ['Nexez checks the request', 'Buyer choices are collected, priced, and checked before the purchase moves forward.'],
  ['The right next step happens', 'Eligible requests can proceed. Exceptions can stop or come to you first.'],
] as const

export default function UseCasesPage() {
  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
          <div className="nx-orb nx-orb--purple !opacity-20" />
          <div className="nx-orb nx-orb--teal !opacity-20" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:py-24">
          <div className="max-w-3xl">
            <div className="eyebrow">Use cases</div>
            <h1 className="mt-5 text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              Different businesses. <span className="nx-accent-text">Same control.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              AI can bring the buyer. You still decide what you sell, what it costs, what you need to know, and which requests your business accepts.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={appUrl('/create')} className="btn-primary h-11 px-5">
                Set up your business
                <ArrowRight className="size-4" />
              </a>
              <a href="/how-it-works" className="btn-secondary h-11 px-5">See how Nexez works</a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">The pattern</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Nexez helps turn a request into the right next step.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sharedSteps.map(([title, copy], index) => (
              <div key={title} className="nx-tile p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                  <CheckCircle2 className="size-4 text-[var(--ready)]" />
                </div>
                <h3 className="mt-4 text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">See it in your kind of business</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              The details change. The merchant stays in charge.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {useCases.map((useCase) => {
              const story = getUseCaseCommerceStory(useCase.slug)
              if (!story) return null

              return (
                <a key={useCase.slug} href={`/use-cases/${useCase.slug}`} className="nx-tile group block p-6">
                  <div className="flex items-center gap-2 text-[var(--signal)]">
                    <Bot className="size-5" />
                    <span className="font-mono text-xs uppercase tracking-[0.16em]">{useCase.label}</span>
                  </div>
                  <h3 className="mt-4 text-2xl font-medium tracking-tight group-hover:text-white">
                    {story.headline}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{story.description}</p>
                  <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
                    See how it works
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-medium text-muted-foreground">What stays true everywhere</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              AI helps sell. It does not get to make up your business.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Nexez uses the offers, prices, buyer questions, and rules you set. If a request does not fit, it can stop or come back to you instead of being guessed through.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Your offer', 'You decide what is for sale, what is included, and what choices the buyer can make.'],
              ['Your rules', 'You decide what information is required and which requests can move forward.'],
              ['Your next step', 'Checkout, booking, repeat service, quote, or review follows the path your offer supports.'],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-lg border border-border bg-white/[0.03] p-5">
                <CheckCircle2 className="size-5 text-[var(--ready)]" />
                <h3 className="mt-4 text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
