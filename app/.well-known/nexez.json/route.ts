import { buildNexezCapabilities } from '../../../lib/agent-capabilities'

export async function GET() {
  return Response.json(buildNexezCapabilities(), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      // Out of Google's index; agents still fetch/crawl this freely.
      'X-Robots-Tag': 'noindex',
    },
  })
}
