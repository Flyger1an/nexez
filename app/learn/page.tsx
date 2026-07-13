import type { Metadata } from 'next'
import { ArrowRight, BookOpen } from 'lucide-react'
import { learnArticles } from '../../lib/learn-content'
import { marketingUrl } from '../../lib/site'

const metaTitle = 'Learn — guides to selling through AI agents'
const metaDescription =
  'Practical guides to agentic commerce: selling through ChatGPT and Google, ACP and UCP enrollment, MCP, llms.txt, and making any business bookable by AI agents.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/learn'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/learn'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function LearnHubPage() {
  const articles = [...learnArticles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Nexez guides',
    numberOfItems: articles.length,
    itemListElement: articles.map((a, i) => ({
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-16 md:py-20">
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--signal)' }}>
            <BookOpen className="size-4" /> Learn
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.045em] md:text-5xl">
            Guides to selling through AI agents.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            How agentic commerce actually works — and how to make your business discoverable, understandable, and
            bookable by the agents doing the buying.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:py-16">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <a
              key={article.slug}
              href={`/learn/${article.slug}`}
              className="group flex flex-col rounded-xl border border-border bg-white/[0.02] p-6 transition hover:border-[var(--signal)]/40 hover:bg-white/[0.04]"
            >
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--signal)' }}>
                {article.category}
              </span>
              <h2 className="mt-3 text-lg font-semibold leading-snug">{article.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{article.dek}</p>
              <span className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {new Date(`${article.updatedAt}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                  {' · '}
                  {article.readMinutes} min read
                </span>
                <ArrowRight className="size-4 transition group-hover:translate-x-0.5" style={{ color: 'var(--signal)' }} />
              </span>
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}
