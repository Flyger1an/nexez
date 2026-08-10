import { buildMcpServerCard } from '../../../lib/agent-cards'

/**
 * Bare /.well-known/mcp - some MCP clients probe this path (without the
 * /server-card.json suffix) for server metadata. Serve the same card so both
 * probes resolve identically.
 */
export async function GET() {
  return Response.json(buildMcpServerCard(), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
