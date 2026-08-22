import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { AgentPage } from '../lib/agent-page'
import { learnArticles } from '../lib/learn-content'
import { useCases } from '../lib/marketing-content'
import { scanPlatforms } from '../lib/scan-platforms'
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
    // No lastModified: an always-now timestamp is distrusted/ignored by Google,
    // and omitting it is valid sitemap XML.
    const entry = (
      path: string,
      priority: number,
      changeFrequency: 'daily' | 'weekly' | 'monthly',
    ): MetadataRoute.Sitemap[number] => ({ url: marketingUrl(path), changeFrequency, priority })
    return [
      entry('/', 1, 'daily'),
      entry('/scan', 0.9, 'weekly'),
      ...scanPlatforms.map((p) => entry(`/scan/${p.slug}`, 0.8, 'monthly')),
      entry('/tools/llms-txt-generator', 0.8, 'monthly'),
      entry('/agents', 0.9, 'weekly'),
      entry('/docs', 0.9, 'weekly'),
      entry('/how-it-works', 0.9, 'weekly'),
      entry('/use-cases', 0.85, 'weekly'),
      ...useCases.map((useCase) => entry(`/use-cases/${useCase.slug}`, 0.75, 'monthly')),
      entry('/examples', 0.85, 'weekly'),
      entry('/agent-readiness', 0.85, 'weekly'),
      entry('/pricing', 0.9, 'weekly'),
      entry('/integrations', 0.75, 'monthly'),
      entry('/developers', 0.75, 'monthly'),
      entry('/developers/buyer-approval', 0.7, 'monthly'),
      entry('/security', 0.7, 'monthly'),
      entry('/compare', 0.7, 'monthly'),
      entry('/enterprise', 0.65, 'monthly'),
      entry('/learn', 0.85, 'weekly'),
      // Articles carry REAL content dates (the one marketing surface where we have them).
      ...learnArticles.map((article) => ({
        url: marketingUrl(`/learn/${article.slug}`),
        lastModified: new Date(`${article.updatedAt}T00:00:00Z`),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
      entry('/discovery', 0.8, 'daily'),
      entry('/leaderboard', 0.6, 'daily'),
      entry('/simulator', 0.5, 'weekly'),
      entry('/support', 0.4, 'monthly'),
      entry('/privacy', 0.2, 'monthly'),
      entry('/terms', 0.2, 'monthly'),
    ]
  }

  if (isApp) return []

  // Public agent sitemap is always rooted at nexez.app. Google only gets the
  // indexable HTML listing pages: /checkout URLs are thin transactional pages
  // (noindexed, canonical → the listing), and agents discover the JSON/API
  // artifacts via .well-known + <link rel="alternate"> + /agent-pages.json,
  // not the Google sitemap.
  const baseUrl = agentRuntimeUrl('/').replace(/\/$/, '')
  const { data: pages } = await supabase
    .from('pages_public')
    .select('slug, created_at, updated_at, marketplace_discoverable')
    .eq('is_published', true)
    .returns<Pick<AgentPage, 'slug' | 'created_at' | 'updated_at' | 'marketplace_discoverable'>[]>()

  const lastMod = (page: { updated_at?: string | null; created_at?: string | null }) =>
    page.updated_at ? new Date(page.updated_at) : page.created_at ? new Date(page.created_at) : undefined

  return publicLaunchVisiblePages(pages).map((page) => ({
    url: `${baseUrl}/${page.slug}`,
    lastModified: lastMod(page),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
}
