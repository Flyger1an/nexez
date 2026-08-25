const PUBLIC_KEY_ENV = 'MCP_REGISTRY_PUBLIC_KEY'

export async function GET() {
  const publicKey = validEd25519PublicKey(process.env[PUBLIC_KEY_ENV])
  if (!publicKey) return new Response('Not found', { status: 404 })

  return new Response(`v=MCPv1; k=ed25519; p=${publicKey}\n`, {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

function validEd25519PublicKey(value: string | undefined): string | null {
  const key = value?.trim() || ''
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) return null
  try {
    const bytes = Buffer.from(key, 'base64')
    return bytes.length === 32 && bytes.toString('base64') === key ? key : null
  } catch {
    return null
  }
}
