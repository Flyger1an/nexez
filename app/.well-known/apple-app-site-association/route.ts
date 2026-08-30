import { buildNexxiAppleAppSiteAssociation } from '../../../lib/nexxi-app-association'

export async function GET() {
  const association = buildNexxiAppleAppSiteAssociation(process.env.NEXXI_APPLE_TEAM_ID)
  if (!association) {
    return Response.json({ error: 'Nexxi Apple app association is not configured.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    })
  }
  return Response.json(association, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
