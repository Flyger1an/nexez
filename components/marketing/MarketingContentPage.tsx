import type { ReactNode } from 'react'
import { ArrowRight, CheckCircle2, Code2, Sparkles } from 'lucide-react'
import type { MarketingPageContent } from '../../lib/marketing-content'
import type { Accent } from './heroes'

const tone = (a: Accent) => `var(--${a})`

// Shared marketing body. Each page passes a bespoke `hero` (its own layout +
// graphic) and an `accent`; the body below the hero (sections, FAQ, CTA) is
// shared but tinted by the accent so the family stays cohesive while every page
// keeps its own identity.
export function MarketingContentPage({
  content,
  hero,
  proof,
  accent = 'signal',
}: {
  content: MarketingPageContent
  hero?: ReactNode
  proof?: ReactNode
  accent?: Accent
}) {
  return (
    <main className="min-h-screen">
      {hero ?? <DefaultHero content={content} />}
      {proof}

      {content.sections.map((section, index) => (
        <section
          key={section.title}
          className={`border-b border-border ${index % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
        >
          <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
            <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
              <div>
                {section.eyebrow ? (
                  <p className="text-sm font-medium" style={{ color: tone(accent) }}>{section.eyebrow}</p>
                ) : null}
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                  {section.title}
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                  {section.copy}
                </p>
              </div>

              {section.cards?.length ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {section.cards.map((card) => (
                    <div key={card.title} className="nx-tile p-5">
                      <CheckCircle2 className="size-5" style={{ color: tone(accent) }} />
                      <h3 className="mt-4 text-lg font-medium tracking-tight">{card.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.copy}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ))}

      {content.faq?.length ? (
        <section className="border-b border-border bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
            <div className="mb-8 max-w-2xl">
              <p className="text-sm font-medium" style={{ color: tone(accent) }}>Questions</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">FAQ</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {content.faq.map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-white/[0.03] p-5">
                  <h3 className="text-base font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div
            className="nx-orb !opacity-20"
            style={{
              width: '34rem',
              height: '34rem',
              top: 'auto',
              bottom: '-22rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: `radial-gradient(circle at 50% 50%, ${tone(accent)}, transparent 62%)`,
            }}
          />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 py-20 text-center md:py-24">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] md:text-6xl">{content.finalCtaTitle}</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            {content.finalCtaCopy}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
      </section>
    </main>
  )
}

// Fallback hero (used only if a page doesn't supply its own bespoke hero).
function DefaultHero({ content }: { content: MarketingPageContent }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="nx-grid" />
        <div className="nx-orb nx-orb--purple !opacity-20" />
        <div className="nx-orb nx-orb--teal !opacity-20" />
      </div>
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)] lg:items-center lg:py-24">
        <div>
          <div className="eyebrow">{content.eyebrow}</div>
          <h1 className="mt-5 max-w-4xl text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
            {content.title} <span className="nx-accent-text">{content.accent}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">{content.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
        <HeroProofPanel title={content.visualTitle} items={content.visualItems} />
      </div>
    </section>
  )
}

function HeroProofPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="nx-glass-panel p-5">
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <div className="flex size-9 items-center justify-center rounded-md border border-border bg-black/30">
          <Code2 className="size-4 text-[var(--signal)]" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="font-mono text-xs text-muted-foreground">nexez.agent.ready</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {items.map((item, index) => (
          <div key={item} className="flex gap-3 rounded-lg border border-border bg-white/[0.03] p-4">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 font-mono text-xs text-[var(--signal)]">
              {index + 1}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg border border-[var(--ready)]/25 bg-[var(--ready)]/10 p-4">
        <div className="flex items-center gap-2 text-[var(--ready)]">
          <Sparkles className="size-4" />
          <p className="text-sm font-medium">Agent clarity signal</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Structured for agents, readable by people - every offer carries the price, proof, and next action a buyer needs to move.
        </p>
      </div>
    </div>
  )
}
