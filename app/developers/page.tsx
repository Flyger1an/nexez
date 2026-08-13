import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { DevelopersHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { agentRuntimeUrl, marketingUrl } from '../../lib/site'

const base = marketingPages.developers

// The ARD catalog is appended here rather than in lib/marketing-content so the
// developer surface list stays next to the other runtime artifact references
// and can track the spec without editing shared marketing copy. Everything
// else on this page still comes from the central content module.
const content = {
  ...base,
  visualItems: [
    ...base.visualItems,
    'Registry discovery: /.well-known/ai-catalog.json (Agentic Resource Discovery).',
  ],
  faq: [
    ...(base.faq ?? []),
    {
      title: 'Do you support Agentic Resource Discovery?',
      copy: `Yes. Nexez publishes an ARD ai-catalog manifest at ${agentRuntimeUrl('/.well-known/ai-catalog.json')}, listing the platform MCP server, the search API, and every published storefront and listing MCP endpoint so registries can index them by capability.`,
    },
  ],
}

// SERP copy (≤60-char title incl. the layout's ' · Nexez'; ≤160-char description).
const metaTitle = 'Developer APIs for agent-ready listings'
const metaDescription =
  'REST APIs, webhooks, MCP servers, and machine-readable artifacts — agent.json, llms.txt, OpenAPI, ai-catalog — for building on the Nexez agent-commerce layer.'

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
