import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { HowItWorksHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages['how-it-works']

export const metadata: Metadata = {
  title: 'How Nexez Works',
  description: content.description,
}

export default function HowItWorksPage() {
  return <MarketingContentPage content={content} accent="signal" hero={<HowItWorksHero content={content} />} />
}
