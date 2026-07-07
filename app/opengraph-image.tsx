import { marketingOgSize, renderMarketingOg } from '../lib/marketing-og'

export const alt = 'Nexez - get found by the agents doing the buying'
export const size = marketingOgSize
export const contentType = 'image/png'

export default function Image() {
  return renderMarketingOg({
    eyebrow: 'Agentic commerce layer',
    title: 'Get found by the agents',
    accent: 'doing the buying.',
    accentTone: 'signal',
  })
}
