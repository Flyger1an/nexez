import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { AgentPage, getCheckoutOffers, getCheckoutPath } from '../lib/agent-page'
import { getAgentJsonPath } from '../lib/agent-manifest'
import { useCases } from '../lib/marketing-content'
import { publicLaunchVisiblePages } from '../lib/public-page-visibility'
import { supabase } from '../lib/supabase'
import { AGENT_RUNTIME_HOST, APP_HOST, MARKETING_HOST, agentRuntimeUrl, marketingUrl } from '../lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Host-aware split: marketing/discovery URLs on nexez.ai, app UI hidden from
  // search, and agent pages/artifacts on nexez.app.
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || AGENT_RUNTIME_HOST).split(',')[0]!.trim().toLowerCase()
  const isMarketing = host === MARKETING_HOST || host === `www.${MARKETING_HOST}`
  const isApp = host === APP_HOST || host === `www.${APP_HOST}`

  if (isMarketing) {
    const entry = (
      path: string,
      priority: number,
      changeFrequency: 'daily' | 'weekly' | 'monthly',
    ): MetadataRoute.Sitemap[number] => ({ url: marketingUrl(path), lastModified: new Date(), changeFrequency, priority })
    return [
      entry('/', 1, 'daily'),
      entry('/how-it-works', 0.9, 'weekly'),
      entry('/use-cases', 0.85, 'weekly'),
      ...useCases.map((useCase) => entry(`/use-cases/${useCase.slug}`, 0.75, 'monthly')),
      entry('/examples', 0.85, 'weekly'),
      entry('/agent-readiness', 0.85, 'weekly'),
      entry('/pricing', 0.9, 'weekly'),
      entry('/integrations', 0.75, 'monthly'),
      entry('/developers', 0.75, 'monthly'),
      entry('/security', 0.7, 'monthly'),
      entry('/compare', 0.7, 'monthly'),
      entry('/enterprise', 0.65, 'monthly'),
      entry('/discovery', 0.8, 'daily'),
      entry('/leaderboard', 0.6, 'daily'),
      entry('/simulator', 0.5, 'weekly'),
      entry('/support', 0.4, 'monthly'),
      entry('/privacy', 0.2, 'monthly'),
      entry('/terms', 0.2, 'monthly'),
    ]
  }

  if (isApp) return []

  // Public agent sitemap is always rooted at nexez.app.
  const baseUrl = agentRuntimeUrl('/').replace(/\/$/, '')
  const { data: pages } = await supabase
    .from('pages_public')
    .select('slug, created_at, updated_at, products, services')
    .eq('is_published', true)
    .returns<Pick<AgentPage, 'slug' | 'created_at' | 'updated_at' | 'products' | 'services'>[]>()

  const lastMod = (page: { updated_at?: string | null; created_at?: string | null }) =>
    page.updated_at ? new Date(page.updated_at) : page.created_at ? new Date(page.created_at) : new Date()

  const visiblePages = publicLaunchVisiblePages(pages)

  return [
    { url: `${baseUrl}/agent-pages.json`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/openapi.json`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/.well-known/nexez.json`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/api/agent-search`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.6 },
    ...visiblePages.map((page) => ({
      url: `${baseUrl}/${page.slug}`,
      lastModified: lastMod(page),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...visiblePages.map((page) => ({
      url: `${baseUrl}${getAgentJsonPath(page.slug)}`,
      lastModified: lastMod(page),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...visiblePages.flatMap((page) =>
      getCheckoutOffers(page).map((offer) => ({
        url: `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
        lastModified: lastMod(page),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
    ),
  ]
}
