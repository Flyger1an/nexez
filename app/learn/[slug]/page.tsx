import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ArticleRenderer } from '../../../components/learn/ArticleRenderer'
import { getLearnArticle, learnArticles } from '../../../lib/learn-content'
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

export default async function LearnArticlePage({ params }: ArticleProps) {
  const { slug } = await params
  const article = getLearnArticle(slug)
  if (!article) notFound()

  // Article + FAQPage schema from the same data the page renders.
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
      <article className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <a href="/learn" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-[var(--fg)]">
          <ArrowLeft className="size-4" /> All guides
        </a>
        <p className="mt-6 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--signal)' }}>
          {article.category}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] md:text-[2.6rem] md:leading-[1.1]" style={{ textWrap: 'balance' }}>
          {article.title}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{article.dek}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          Updated{' '}
          {new Date(`${article.updatedAt}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
          {' · '}
          {article.readMinutes} min read
        </p>
        <hr className="mt-8 border-border" />
        <ArticleRenderer article={article} />
      </article>
    </main>
  )
}
