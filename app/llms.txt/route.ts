import { AgentPage, PUBLIC_PAGE_SELECT, getCheckoutOffers, getCheckoutPath, getOfferCount, getRequestBaseUrl, sanitizePublicUrl } from '../../lib/agent-page'
import {
  NEXEZ_AGENT_EXAMPLES,
  NEXEZ_OPENCLAW_PLUGIN,
  NEXEZ_OPENCLAW_SKILL,
  NEXEZ_PYTHON_SDK,
  NEXEZ_TYPESCRIPT_SDK,
  buildAgentDistributionLinks,
} from '../../lib/agent-distribution'
import { getAgentJsonPath } from '../../lib/agent-manifest'
import { markdownLinkLabel, markdownText } from '../../lib/agent-text'
import { publicLaunchVisiblePages } from '../../lib/public-page-visibility'
import { supabase } from '../../lib/supabase'

const GLOBAL_LLMS_OFFERS_PER_PAGE = 12

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request)
  const distribution = buildAgentDistributionLinks(baseUrl)
  const { data: pages } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  const body = [
    '# Nexez',
    '',
    '> AI-readable product and service pages for businesses that want agent discovery.',
    '',
    `Agent index: ${baseUrl}/agent-pages.json`,
    `Agent search API: ${baseUrl}/api/agent-search?q={query}`,
    `OpenAPI spec: ${baseUrl}/openapi.json`,
    `Capabilities manifest: ${baseUrl}/.well-known/nexez.json`,
    `MCP discovery catalog: ${baseUrl}/.well-known/mcp.json`,
    `Agent access docs: ${distribution.docs_url}`,
    '',
    '## OpenClaw Access',
    '',
    `Plugin: ${NEXEZ_OPENCLAW_PLUGIN.name} (${NEXEZ_OPENCLAW_PLUGIN.version})`,
    `Install plugin: ${NEXEZ_OPENCLAW_PLUGIN.installCommand}`,
    `Skill: ${NEXEZ_OPENCLAW_SKILL.slug} (${NEXEZ_OPENCLAW_SKILL.version})`,
    `Install skill: ${NEXEZ_OPENCLAW_SKILL.installCommand}`,
    `TypeScript SDK: ${NEXEZ_TYPESCRIPT_SDK.name} (${NEXEZ_TYPESCRIPT_SDK.version})`,
    `Install TypeScript SDK: ${NEXEZ_TYPESCRIPT_SDK.installCommand}`,
    `SDK package: ${NEXEZ_TYPESCRIPT_SDK.npmUrl}`,
    `Python SDK: ${NEXEZ_PYTHON_SDK.name} (${NEXEZ_PYTHON_SDK.version})`,
    `Install Python SDK: ${NEXEZ_PYTHON_SDK.installCommand}`,
    `Python SDK package: ${NEXEZ_PYTHON_SDK.pypiUrl}`,
    `Agent examples: ${NEXEZ_AGENT_EXAMPLES.sourceUrl}`,
    '',
    '## Published Agent Pages',
    '',
    ...publicLaunchVisiblePages(pages).map((page) => {
      const offers = getCheckoutOffers(page)
      const shownOffers = offers.slice(0, GLOBAL_LLMS_OFFERS_PER_PAGE)
      const omitted = Math.max(0, offers.length - shownOffers.length)
      return [
        `- [${markdownLinkLabel(page.name)}](${baseUrl}/${page.slug})`,
        `  - Agent JSON: ${baseUrl}${getAgentJsonPath(page.slug)}`,
        ...((page as any).mcp_enabled ? [`  - MCP manifest: ${baseUrl}/${page.slug}/mcp.json`] : []),
        `  - Summary: ${markdownText(page.description, 'No summary provided.', 360)}`,
        `  - Location: ${markdownText(page.location, 'Not specified', 160)}`,
        `  - Offers: ${getOfferCount(page)}`,
        `  - Primary action: ${markdownText(page.cta_label, 'Visit website', 80)} -> ${sanitizePublicUrl(page.cta_url) || sanitizePublicUrl(page.website_url) || `${baseUrl}/${page.slug}`}`,
        ...shownOffers.map((offer) =>
          `  - Checkout: ${markdownText(offer.name, 'Offer', 120)} -> ${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
        ),
        ...(omitted ? [`  - Additional offers omitted from this global index: ${omitted}. Use Agent JSON for the full offer list.`] : []),
      ].join('\n')
    }),
    '',
    '## Agent Use',
    '',
    'Use these pages to understand each business, compare listed products and services, answer buyer questions, and route purchase or booking intent to the provided URLs.',
    '',
    'For query-based discovery, call the Agent search API with a buyer request such as q=consulting, q=strategy session, or q=book a service.',
    '',
    'For checkout validation, POST to /api/checkout with slug, offer, query, and dryRun=true to verify the handoff without opening Stripe or redirecting.',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      // Base URL reflects the request host - vary the CDN cache key on it.
      Vary: 'x-forwarded-host',
    },
  })
}
