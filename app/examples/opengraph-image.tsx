import { marketingOgSize, renderMarketingOg } from '../../lib/marketing-og'

export const alt = 'Nexez agent page examples and templates'
export const size = marketingOgSize
export const contentType = 'image/png'

export default function Image() {
  return renderMarketingOg({
    eyebrow: 'Examples',
    title: 'Start with the page shape',
    accent: 'agents already want.',
    accentTone: 'amber',
  })
}
