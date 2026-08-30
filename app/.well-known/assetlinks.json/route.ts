import { buildNexxiAndroidAssetLinks } from '../../../lib/nexxi-app-association'

export async function GET() {
  const association = buildNexxiAndroidAssetLinks(process.env.NEXXI_ANDROID_SHA256_CERT_FINGERPRINTS)
  if (!association) {
    return Response.json({ error: 'Nexxi Android app association is not configured.' }, {
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
