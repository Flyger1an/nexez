import { buildMcpServerCard } from '../../../../lib/agent-cards'

/**
 * MCP server card - the per-server descriptor newer MCP clients probe for
 * (production logs: ~19 requests/day 404ing here before this route existed).
 * Describes the /mcp endpoint itself; the listing catalog stays at
 * /.well-known/mcp.json.
 */
export async function GET() {
  return Response.json(buildMcpServerCard(), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
