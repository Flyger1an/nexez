import { buildOpenApiSpec } from '../../lib/agent-capabilities'
import { withOfferConfigurationOpenApi } from '../../lib/agent-offer-configuration'

export async function GET() {
  return Response.json(withOfferConfigurationOpenApi(buildOpenApiSpec()), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      // Out of Google's index; agents still fetch/crawl this freely.
      'X-Robots-Tag': 'noindex',
    },
  })
}
