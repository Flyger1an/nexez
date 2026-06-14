import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { CompareHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.compare

export const metadata: Metadata = {
  title: 'Compare Nexez',
  description: content.description,
}

export default function ComparePage() {
  return <MarketingContentPage content={content} accent="ready" hero={<CompareHero content={content} />} />
}
