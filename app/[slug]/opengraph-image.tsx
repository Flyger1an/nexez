import { marketingOgSize, renderMarketingOg } from '../../lib/marketing-og'
import { AgentPage, getOfferCount } from '../../lib/agent-page'
import { supabase } from '../../lib/supabase'

// Per-listing OG/Twitter card (file convention: Next auto-wires og:image +
// twitter:image into the page's metadata). Listings declared summary_large_image
// with NO image before this - shares degraded to a bare text card.
export const alt = 'Agent-ready listing on Nexez'
export const size = marketingOgSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages_public')
    .select('name, products, services, is_published')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<AgentPage>()

  // Unknown/unpublished slug → the generic brand card (the page itself 404s).
  if (!page) {
    return renderMarketingOg({
      eyebrow: 'Nexez',
      title: 'Listings built',
      accent: 'for AI agents.',
      accentTone: 'signal',
    })
  }

  const offers = getOfferCount(page)
  // Big display lines must stay short (fixed 78/70px type in the shared card):
  // offer count rides the eyebrow, long names are ellipsized.
  const name = page.name.length > 48 ? `${page.name.slice(0, 47)}…` : page.name
  return renderMarketingOg({
    eyebrow: offers > 0 ? `Agent-ready · ${offers} offer${offers === 1 ? '' : 's'}` : 'Agent-ready listing',
    title: name,
    accent: 'Bookable by AI agents.',
    accentTone: 'signal',
  })
}
