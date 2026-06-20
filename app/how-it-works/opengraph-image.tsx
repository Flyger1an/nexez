import { marketingOgSize, renderMarketingOg } from '../../lib/marketing-og'

export const alt = 'Nexez how it works'
export const size = marketingOgSize
export const contentType = 'image/png'

export default function Image() {
  return renderMarketingOg({
    eyebrow: 'How it works',
    title: 'Your website is for people.',
    accent: 'Your Nexez listing is for agents.',
    accentTone: 'signal',
  })
}
