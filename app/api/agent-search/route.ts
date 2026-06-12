import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { searchAgentPages } from '../../../lib/agent-search'
import { supabase } from '../../../lib/supabase'
import { enforceRateLimit } from '../../../lib/rate-limit'

export async function GET(request: Request) {
  // Public agent-facing search — throttle to blunt scraping/DB abuse.
  const limited = await enforceRateLimit(request, 'agent-search', 30, 60_000)
  if (limited) return limited

  const url = new URL(request.url)
  const query = url.searchParams.get('q') || ''
  const limit = Number(url.searchParams.get('limit') || 10)

  const { data: pages, error } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<AgentPage[]>()

  if (error) {
    return Response.json(
      {
        error: 'Search is temporarily unavailable.',
        details: error.message,
      },
      { status: 500 },
    )
  }

  const baseUrl = getRequestBaseUrl(request)
  const results = searchAgentPages(pages ?? [], query, Number.isFinite(limit) ? limit : 10, baseUrl)

  return Response.json(
    {
      schema_version: 'nexez.agent-search.v1',
      generated_at: new Date().toISOString(),
      query,
      result_count: results.length,
      search_url: `${baseUrl}/api/agent-search?q=${encodeURIComponent(query)}`,
      results,
      usage: {
        method: 'GET',
        example: `${baseUrl}/api/agent-search?q=consulting`,
        note: 'Returns published AI-readable pages and offer-level checkout actions. Use agent_json_url for full seller context.',
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=180',
      },
    },
  )
}
