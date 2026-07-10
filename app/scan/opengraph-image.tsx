import { marketingOgSize, renderMarketingOg } from '../../lib/marketing-og'

export const alt = 'Scan your website for agent legibility'
export const size = marketingOgSize
export const contentType = 'image/png'

export default function Image() {
  return renderMarketingOg({
    eyebrow: 'Free scan',
    title: 'Is your website legible to AI agents?',
    accent: 'Score it in seconds.',
    accentTone: 'signal',
  })
}
