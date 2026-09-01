export const dynamic = 'force-dynamic'

export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim()
  if (!token) return new Response('Not found', { status: 404 })

  return new Response(token, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}
