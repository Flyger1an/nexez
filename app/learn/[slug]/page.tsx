import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ArticleRenderer } from '../../../components/learn/ArticleRenderer'
import { ArticleCard } from '../../../components/learn/ArticleCard'
import { TableOfContentsInline, TableOfContentsRail } from '../../../components/learn/TableOfContents'
import { BackLink } from '../../../components/BackLink'
import { getLearnArticle, learnArticles } from '../../../lib/learn-content'
import { tocOf } from '../../../lib/learn-headings'
import { relatedArticles } from '../../../lib/learn-related'
import { marketingUrl } from '../../../lib/site'
import { safeJsonScript } from '../../../lib/safe-json'

type ArticleProps = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return learnArticles.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: ArticleProps): Promise<Metadata> {
  const { slug } = await params
  const article = getLearnArticle(slug)
  if (!article) return {}
  return {
    title: article.metaTitle,
    description: article.metaDescription,
    alternates: {
      canonical: marketingUrl(`/learn/${article.slug}`),
    },
    // Page-level openGraph replaces the layout's wholesale (shallow merge), so re-carry type/siteName.
    openGraph: {
      type: 'article',
      siteName: 'Nexez',
      url: marketingUrl(`/learn/${article.slug}`),
      title: article.metaTitle,
      description: article.metaDescription,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
    },
  }
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function LearnArticlePage({ params }: ArticleProps) {
  const { slug } = await params
  const article = getLearnArticle(slug)
  if (!article) notFound()

  const toc = tocOf(article)
  const related = relatedArticles(article)
  const categoryHref = `/learn?category=${encodeURIComponent(article.category)}`

  // Article + FAQPage + BreadcrumbList schema from the same data the page renders.
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: article.title,
        description: article.metaDescription,
        url: marketingUrl(`/learn/${article.slug}`),
        datePublished: article.publishedAt,
        dateModified: article.updatedAt,
        author: { '@type': 'Organization', name: 'Nexez', url: marketingUrl('/') },
        publisher: { '@type': 'Organization', name: 'Nexez', url: marketingUrl('/') },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: marketingUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Learn', item: marketingUrl('/learn') },
          { '@type': 'ListItem', position: 3, name: article.category, item: marketingUrl(categoryHref) },
          { '@type': 'ListItem', position: 4, name: article.title, item: marketingUrl(`/learn/${article.slug}`) },
        ],
      },
      ...(article.faqs.length
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: article.faqs.map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: { '@type': 'Answer', text: faq.answer },
              })),
            },
          ]
        : []),
    ],
  }

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonScript(structuredData) }}
      />

      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><a href="/learn" className="transition hover:text-[var(--fg)]">Learn</a></li>
            <li aria-hidden="true" className="opacity-50">/</li>
            <li><a href={categoryHref} className="transition hover:text-[var(--fg)]">{article.category}</a></li>
          </ol>
        </nav>

        <div className="mt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_200px] xl:gap-14">
          <article className="max-w-3xl">
            <h1
              className="text-3xl font-semibold tracking-[-0.04em] md:text-[2.6rem] md:leading-[1.1]"
              style={{ textWrap: 'balance' }}
            >
              {article.title}
            </h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">{article.dek}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              {/* Reviewed, not just published: in this category most competing content
                  still describes programs that were retired, so being current is the claim. */}
              Reviewed {longDate(article.updatedAt)}
              {' · '}
              {article.readMinutes} min read
            </p>

            <TableOfContentsInline headings={toc} />

            <hr className="mt-8 border-border" />
            <ArticleRenderer article={article} />

            {related.length ? (
              <section className="mt-14 border-t border-border pt-8">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">Keep reading</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {related.map((r) => {
                    const target = getLearnArticle(r.slug)
                    return target ? <ArticleCard key={r.slug} article={target} variant="related" /> : null
                  })}
                </div>
              </section>
            ) : null}

            <div className="mt-10">
              <BackLink
                fallbackHref="/learn"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-[var(--fg)]"
              >
                <ArrowLeft className="size-4" /> All guides
              </BackLink>
            </div>
          </article>

          <aside className="hidden xl:block">
            <TableOfContentsRail headings={toc} />
          </aside>
        </div>
      </div>
    </main>
  )
}
