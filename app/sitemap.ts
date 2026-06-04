import type { MetadataRoute } from 'next'
import { AgentPage, getBaseUrl, getCheckoutOffers, getCheckoutPath } from '../lib/agent-page'
import { getAgentJsonPath } from '../lib/agent-manifest'
import { supabase } from '../lib/supabase'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const { data: pages } = await supabase
    .from('pages')
    .select('slug, created_at, updated_at, products, services')
    .eq('is_published', true)
    .returns<Pick<AgentPage, 'slug' | 'created_at' | 'updated_at' | 'products' | 'services'>[]>()

  const lastMod = (page: { updated_at?: string | null; created_at?: string | null }) =>
    page.updated_at ? new Date(page.updated_at) : page.created_at ? new Date(page.created_at) : new Date()

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/agent-pages.json`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/directory`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/openapi.json`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/.well-known/nexez.json`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/api/agent-search`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/marketplace`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/simulator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    ...(pages ?? []).map((page) => ({
      url: `${baseUrl}/${page.slug}`,
      lastModified: lastMod(page),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...(pages ?? []).map((page) => ({
      url: `${baseUrl}${getAgentJsonPath(page.slug)}`,
      lastModified: lastMod(page),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...(pages ?? []).flatMap((page) =>
      getCheckoutOffers(page).map((offer) => ({
        url: `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
        lastModified: lastMod(page),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
    ),
  ]
}
