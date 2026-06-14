import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { DevelopersHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.developers

export const metadata: Metadata = {
  title: 'Developers',
  description: content.description,
}

export default function DevelopersPage() {
  return <MarketingContentPage content={content} accent="signal" hero={<DevelopersHero content={content} />} />
}
