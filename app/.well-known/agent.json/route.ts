import { buildPlatformAgentManifest } from '../../../lib/platform-agent-manifest'

export async function GET() {
  return Response.json(buildPlatformAgentManifest(), {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600' },
  })
}
