import { afterEach, describe, expect, it } from 'vitest'
import { GET } from './route'

const original = process.env.MCP_REGISTRY_PUBLIC_KEY

afterEach(() => {
  if (original === undefined) delete process.env.MCP_REGISTRY_PUBLIC_KEY
  else process.env.MCP_REGISTRY_PUBLIC_KEY = original
})

describe('/.well-known/mcp-registry-auth', () => {
  it('fails closed when the public key is missing or malformed', async () => {
    delete process.env.MCP_REGISTRY_PUBLIC_KEY
    expect((await GET()).status).toBe(404)
    process.env.MCP_REGISTRY_PUBLIC_KEY = 'not-a-key'
    expect((await GET()).status).toBe(404)
  })

  it('serves the exact official HTTP authentication proof format', async () => {
    const publicKey = Buffer.alloc(32, 7).toString('base64')
    process.env.MCP_REGISTRY_PUBLIC_KEY = publicKey
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toBe(`v=MCPv1; k=ed25519; p=${publicKey}\n`)
  })
})
