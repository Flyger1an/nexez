import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../lib/agents/nexie-auth'
import { exportUserAccount } from '../../../../lib/server/export-account'
import { enforceRateLimit } from '../../../../lib/rate-limit'

export const maxDuration = 30

/**
 * GET /api/account/export — download the authenticated user's personal data as JSON (GDPR/CCPA).
 * Targets the session user only (cookie on web, bearer token in the Nxxi app — never the body),
 * so a session can only export itself. Returns an attachment so a browser saves a file; the Nxxi
 * app fetches the JSON and shares it. Covers agent/buyer data + owned seller data; secrets
 * (api_key hashes, page_secrets) are excluded.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'account:export', 6, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const exportedAt = new Date().toISOString()
  const result = await exportUserAccount(auth.user.id, auth.user.email ?? null, exportedAt)
  if (!result) {
    return NextResponse.json({ error: 'Data export is not available on this deployment.' }, { status: 503 })
  }

  return new NextResponse(JSON.stringify(result, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="nexez-data-export.json"',
      'cache-control': 'no-store',
    },
  })
}
