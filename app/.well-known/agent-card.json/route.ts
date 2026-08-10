import { buildA2AAgentCard } from '../../../lib/agent-cards'

/**
 * A2A agent card - the discovery document A2A-protocol clients probe at
 * /.well-known/agent-card.json (distinct from the platform manifest at
 * /.well-known/agent.json, which stays untouched for existing integrations).
 */
export async function GET() {
  return Response.json(buildA2AAgentCard(), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
