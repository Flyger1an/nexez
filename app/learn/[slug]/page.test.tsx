import { describe, expect, it } from 'vitest'
import { generateMetadata, generateStaticParams } from './page'
import { learnArticles } from '../../../lib/learn-content'
import { marketingUrl } from '../../../lib/site'

describe('/learn/[slug] static params', () => {
  it('prerenders every registered article and nothing else', () => {
    const params = generateStaticParams()
    expect(params.map((p) => p.slug).sort()).toEqual(learnArticles.map((a) => a.slug).sort())
  })
})

describe('/learn/[slug] metadata', () => {
  it.each(learnArticles.map((a) => [a.slug, a] as const))(
    '%s carries its own canonical, OG and article timestamps',
    async (slug, article) => {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug }) })

      expect(metadata.title).toBe(article.metaTitle)
      expect(metadata.description).toBe(article.metaDescription)
      expect(metadata.alternates?.canonical).toBe(marketingUrl(`/learn/${slug}`))

      const og = metadata.openGraph as Record<string, unknown> | undefined
      expect(og?.url).toBe(marketingUrl(`/learn/${slug}`))
      expect(og?.title).toBe(article.metaTitle)
      expect(og?.description).toBe(article.metaDescription)
      // Page-level openGraph shallow-replaces the layout's, so type and siteName
      // have to be re-carried or every article shares as a bare website card.
      expect(og?.type).toBe('article')
      expect(og?.siteName).toBe('Nexez')
      expect(og?.publishedTime).toBe(article.publishedAt)
      expect(og?.modifiedTime).toBe(article.updatedAt)
    },
  )

  it('returns empty metadata for an unknown slug rather than throwing', async () => {
    // The page notFound()s; generateMetadata runs first and must not blow up.
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'no-such-article' }) })).toEqual({})
  })
})
