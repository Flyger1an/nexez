import { AgentPage } from '../../../lib/agent-page'
import { buildMcpDiscoveryCatalog, McpDiscoveryPage } from '../../../lib/mcp-discovery'
import { supabase } from '../../../lib/supabase'

const MCP_DISCOVERY_SELECT = [
  'name',
  'slug',
  'description',
  'location',
  'products',
  'services',
  'created_at',
  'mcp_enabled',
].join(', ')

export async function GET() {
  const { data: pages, error } = await supabase
    .from('pages_public')
    .select(MCP_DISCOVERY_SELECT)
    .eq('is_published', true)
    .eq('mcp_enabled', true)
    .order('created_at', { ascending: false })
    .returns<McpDiscoveryPage[]>()

  const body = error
    ? {
        ...buildMcpDiscoveryCatalog([]),
        page_count: 0,
        pages: [],
        warning: 'MCP discovery is unavailable until the mcp_enabled schema migration is applied.',
      }
    : buildMcpDiscoveryCatalog((pages ?? []) as Pick<AgentPage, keyof McpDiscoveryPage>[])

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=120, s-maxage=600',
    },
  })
}
