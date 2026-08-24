import { marketingOgSize, renderMarketingOg } from '../../lib/marketing-og'

export const alt = 'Nexez guides to agentic commerce'
export const size = marketingOgSize
export const contentType = 'image/png'

export default function Image() {
  return renderMarketingOg({
    eyebrow: 'Nexez guides',
    title: 'Guides to selling',
    accent: 'through AI agents.',
    accentTone: 'signal',
  })
}
