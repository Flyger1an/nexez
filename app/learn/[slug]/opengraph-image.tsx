import { marketingOgSize, renderMarketingOg } from '../../../lib/marketing-og'
import { getLearnArticle } from '../../../lib/learn-content'
import { ogEyebrow, ogToneForCategory, splitOgTitle } from '../../../lib/learn-og'

// Per-article OG/Twitter card (file convention: Next auto-wires og:image and
// twitter:image into the page's metadata). Every /learn article shared the one
// generic brand card before this, so seventeen distinct guides all previewed
// identically on social.
export const alt = 'Nexez guide to agentic commerce'
export const size = marketingOgSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getLearnArticle(slug)

  // Unknown slug: the generic hub card (the page itself 404s).
  if (!article) {
    return renderMarketingOg({
      eyebrow: 'Nexez guides',
      title: 'Guides to selling',
      accent: 'through AI agents.',
      accentTone: 'signal',
    })
  }

  const { title, accent } = splitOgTitle(article.metaTitle)
  return renderMarketingOg({
    eyebrow: ogEyebrow(article),
    title,
    accent,
    accentTone: ogToneForCategory(article.category),
  })
}
