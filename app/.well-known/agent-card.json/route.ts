import { buildA2AAgentCard } from '../../../lib/agent-cards'
import { A2A_TRANSPORT_DEPLOYED } from '../../../lib/a2a/discovery'

const DISCOVERY_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'X-Robots-Tag': 'noindex',
}

/**
 * A2A Agent Card discovery fails closed until the matching protocol endpoint is
 * deployed. Returning no card is safer than sending clients to a non-A2A REST
 * URL or advertising capabilities the runtime cannot honor.
 */
export async function GET() {
  if (!A2A_TRANSPORT_DEPLOYED) {
    return new Response(null, {
      status: 404,
      headers: {
        ...DISCOVERY_HEADERS,
        'Cache-Control': 'no-store',
      },
    })
  }

  return Response.json(buildA2AAgentCard(), {
    headers: {
      ...DISCOVERY_HEADERS,
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  })
}
