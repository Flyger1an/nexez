import type { Metadata } from 'next'
import { BookOpen, Compass } from 'lucide-react'
import { ArticleCard } from '../../components/learn/ArticleCard'
import { CategoryFilter } from '../../components/learn/CategoryFilter'
import { EmptyState } from '../../components/EmptyState'
import {
  articlesInCategory,
  getFeaturedArticle,
  getStartHereArticles,
  learnArticles,
  LEARN_CATEGORIES,
  sortedArticles,
  type LearnArticle,
} from '../../lib/learn-content'
import { marketingUrl } from '../../lib/site'
import { safeJsonScript } from '../../lib/safe-json'

const metaTitle = 'Learn: guides to selling through AI agents'
const metaDescription =
  'Practical guides to selling through AI assistants, from discovery and trust to booking, payment, and technical integration.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    // Filtered views are real, crawlable pages but they are slices of this one,
    // so they all point their canonical back here rather than competing with it.
    canonical: marketingUrl('/learn'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge), so re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/learn'),
    title: metaTitle,
    description: metaDescription,
  },
}

type LearnHubProps = { searchParams: Promise<{ category?: string }> }

function isCategory(value: string | undefined): value is LearnArticle['category'] {
  return LEARN_CATEGORIES.some((c) => c === value)
}

/** Most recent updatedAt across the corpus. The freshness claim, computed rather than typed. */
function lastReviewed(): string {
  const latest = learnArticles.reduce((max, a) => (a.updatedAt > max ? a.updatedAt : max), '')
  return new Date(`${latest}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function LearnHubPage({ searchParams }: LearnHubProps) {
  const { category: raw } = await searchParams
  const active = isCategory(raw) ? raw : undefined

  const featured = getFeaturedArticle()
  const startHere = getStartHereArticles()
  const shelves = (active ? [active] : LEARN_CATEGORIES).map((category) => ({
    category,
    // The featured article has the hero slot; repeating it on its own shelf is
    // noise. On a filtered view it belongs in the shelf, because there is no hero.
    articles: articlesInCategory(category).filter((a) => (active ? true : a.slug !== featured?.slug)),
  }))

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Nexez guides',
    numberOfItems: learnArticles.length,
    itemListElement: sortedArticles().map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: a.title,
      url: marketingUrl(`/learn/${a.slug}`),
    })),
  }

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonScript(structuredData) }}
      />

      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
          <span className="nx-orb nx-orb--purple !opacity-20" />
          <span className="nx-orb nx-orb--teal !opacity-20" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-16 md:py-20">
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--signal)' }}>
            <BookOpen className="size-4" /> The library
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.045em] md:text-5xl">
            Everything we know about selling through agents.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            How agentic commerce actually works, and how to make your business discoverable, understandable, and
            bookable by the agents doing the buying. Written against operator documentation, and kept current.
          </p>
          <p className="mt-5 text-xs text-muted-foreground">
            {learnArticles.length} guides
            {' · '}
            Last reviewed {lastReviewed()}
          </p>
        </div>
      </section>

      {active ? null : (
        <section className="mx-auto max-w-7xl px-5 pt-12 md:pt-16">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-stretch">
            {featured ? <ArticleCard article={featured} variant="featured" /> : null}
            {startHere.length ? (
              <div className="nx-tile flex flex-col p-6">
                <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--signal)' }}>
                  <Compass className="size-4" /> Start here
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Four guides, in order, for anyone who has not thought about this before.
                </p>
                <ol className="mt-4 flex flex-1 flex-col gap-3">
                  {startHere.map((a, i) => (
                    <li key={a.slug}>
                      <a
                        href={`/learn/${a.slug}`}
                        className="group flex gap-3 border-l-2 pl-3 transition"
                        style={{ borderColor: 'color-mix(in srgb, var(--signal) 45%, transparent)' }}
                      >
                        <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--signal)' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm font-medium leading-snug transition group-hover:text-[var(--signal)]">
                          {a.title}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 pt-12 md:pt-14">
        <CategoryFilter active={active} />
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 md:pb-20">
        {shelves.every((s) => s.articles.length === 0) ? (
          <div className="pt-10">
            <EmptyState
              icon={BookOpen}
              title="Nothing in this shelf yet"
              ctas={[{ label: 'Browse all guides', href: '/learn', variant: 'primary' }]}
            >
              We have not published in this category yet. Everything else is one click away.
            </EmptyState>
          </div>
        ) : (
          shelves.map(({ category, articles }) =>
            articles.length ? (
              <div key={category} className="pt-10">
                <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] md:text-2xl">{category}</h2>
                  <span className="text-xs text-muted-foreground">
                    {articles.length} {articles.length === 1 ? 'guide' : 'guides'}
                  </span>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {articles.map((article) => (
                    <ArticleCard key={article.slug} article={article} showCategory={false} />
                  ))}
                </div>
              </div>
            ) : null,
          )
        )}
      </section>
    </main>
  )
}
