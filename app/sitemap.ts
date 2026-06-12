import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { AgentPage, getCheckoutOffers, getCheckoutPath } from '../lib/agent-page'
import { getAgentJsonPath } from '../lib/agent-manifest'
import { supabase } from '../lib/supabase'
import { APP_HOST, MARKETING_HOST, marketingUrl } from '../lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Host-aware split: marketing/discovery URLs on nexez.ai, the agent-facing
  // brain (agent pages + artifacts) on nexez.app — each domain its own sitemap.
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || APP_HOST).split(',')[0]!.trim().toLowerCase()
  const isMarketing = host === MARKETING_HOST || host === `www.${MARKETING_HOST}`

  if (isMarketing) {
    const entry = (
      path: string,
      priority: number,
      changeFrequency: 'daily' | 'weekly' | 'monthly',
    ): MetadataRoute.Sitemap[number] => ({ url: marketingUrl(path), lastModified: new Date(), changeFrequency, priority })
    return [
      entry('/', 1, 'daily'),
      entry('/pricing', 0.9, 'weekly'),
      entry('/directory', 0.8, 'daily'),
      entry('/marketplace', 0.7, 'daily'),
      entry('/leaderboard', 0.6, 'daily'),
      entry('/simulator', 0.5, 'weekly'),
      entry('/support', 0.4, 'monthly'),
      entry('/privacy', 0.2, 'monthly'),
      entry('/terms', 0.2, 'monthly'),
    ]
  }

  // Brain/agent sitemap — always rooted at nexez.app.
  const baseUrl = `https://${APP_HOST}`
  const { data: pages } = await supabase
    .from('pages_public')
    .select('slug, created_at, updated_at, products, services')
    .eq('is_published', true)
    .returns<Pick<AgentPage, 'slug' | 'created_at' | 'updated_at' | 'products' | 'services'>[]>()

  const lastMod = (page: { updated_at?: string | null; created_at?: string | null }) =>
    page.updated_at ? new Date(page.updated_at) : page.created_at ? new Date(page.created_at) : new Date()

  return [
    { url: `${baseUrl}/agent-pages.json`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/openapi.json`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/.well-known/nexez.json`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/api/agent-search`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.6 },
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
