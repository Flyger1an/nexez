import { buildOpenApiSpec } from '../../lib/agent-capabilities'

export async function GET() {
  return Response.json(buildOpenApiSpec(), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  })
}
