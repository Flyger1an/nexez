// Shared CORS for the public, per-slug agent artifacts (agent.json, llms.txt,
// openapi.json, mcp.json, embed.json). These serve fully PUBLIC listing data and
// are meant to be fetched cross-origin — by browser-based agents, by the /scan
// client, and (once a merchant installs the redirect recipe / WordPress plugin)
// via a 301 from their own domain that lands here. A wildcard origin is correct:
// there is nothing owner-private in these responses, no credentials are read, and
// it is independent of the request host — so it never weakens the
// `Vary: x-forwarded-host` cache-poison guard those routes already set.

/** Spread into an artifact route's response `headers` to allow cross-origin GET. */
export const ARTIFACT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
} as const

/** Preflight response for the artifact routes (shared OPTIONS handler). */
export function artifactPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  })
}
