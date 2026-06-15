import { marketingOgSize, renderMarketingOg } from '../../lib/marketing-og'

export const alt = 'Nexez AI agent readiness'
export const size = marketingOgSize
export const contentType = 'image/png'

export default function Image() {
  return renderMarketingOg({
    eyebrow: 'Agent readiness',
    title: 'Make your business recommendable',
    accent: 'by AI agents.',
    accentTone: 'ready',
  })
}
