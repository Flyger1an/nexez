import { marketingOgSize, renderMarketingOg } from '../../lib/marketing-og'

export const alt = 'Scan your website to see what AI agents can read'
export const size = marketingOgSize
export const contentType = 'image/png'

export default function Image() {
  return renderMarketingOg({
    eyebrow: 'Free scan',
    title: 'Can AI find your business?',
    accent: 'See what agents see.',
    accentTone: 'signal',
  })
}
