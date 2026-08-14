// Feed regeneration: re-exercise the public agent feed surfaces off the request
// path. Feeds are computed live and CDN-cached, so "regeneration" here means a
// durable job that fetches each surface (revalidating expired CDN entries and
// proving generation works end to end), fails visibly when a surface breaks,
// and gives publish/update flows an event to hook into. This is also where
// IndexNow pings will attach (item 8 of the tooling workstream).
//
// Triggers: the FEED_REGENERATE event (emit on publish/update or manually from
// the Inngest dashboard) plus a 6-hour schedule, so runs are observable as soon
// as the app is registered.

import { inngest } from '../client'
import { FEED_REGENERATE } from '../events'
import { agentRuntimeUrl } from '../../site'

const FEED_SURFACES = ['/acp/feed.json', '/ucp/feed.json', '/agent-pages.json', '/llms.txt'] as const

const FETCH_TIMEOUT_MS = 20000

async function fetchSurface(path: string): Promise<{ path: string; status: number; items: number | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(agentRuntimeUrl(path), {
      headers: { 'User-Agent': 'Nexez FeedRegenerate/1.0' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`${path} -> http_${res.status}`)
    let items: number | null = null
    if (path.endsWith('.json')) {
      const body = (await res.json().catch(() => null)) as { products?: unknown[]; pages?: unknown[] } | unknown[] | null
      if (Array.isArray(body)) items = body.length
      else if (body && Array.isArray(body.products)) items = body.products.length
      else if (body && Array.isArray(body.pages)) items = body.pages.length
    }
    return { path, status: res.status, items }
  } finally {
    clearTimeout(timeout)
  }
}

export const regenerateFeeds = inngest.createFunction(
  { id: 'feed-regenerate', retries: 2, triggers: [{ event: FEED_REGENERATE }, { cron: '0 */6 * * *' }] },
  async ({ step }) => {
    const results = await Promise.all(
      FEED_SURFACES.map((path) => step.run(`regenerate:${path}`, () => fetchSurface(path))),
    )
    return { surfaces: results }
  },
)
