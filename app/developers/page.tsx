import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { DevelopersHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.developers

// SERP copy (≤60-char title incl. the layout's ' · Nexez'; ≤160-char description).
const metaTitle = 'Developer APIs for agent-ready listings'
const metaDescription =
  'REST APIs, MCP servers, and machine-readable artifacts — agent.json, llms.txt, OpenAPI, ai-catalog — for building on the Nexez agent-commerce layer.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/developers'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/developers'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function DevelopersPage() {
  return <MarketingContentPage content={content} accent="signal" hero={<DevelopersHero content={content} />} />
}
