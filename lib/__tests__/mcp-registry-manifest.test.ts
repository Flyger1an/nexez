import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('official MCP Registry manifest', () => {
  it('publishes the canonical Nexez remote without claiming a package', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'server.json'), 'utf8'))
    expect(manifest).toMatchObject({
      name: 'ai.nexez/commerce',
      version: '1.1.0',
      websiteUrl: 'https://nexez.ai/agents',
      remotes: [{ type: 'streamable-http', url: 'https://nexez.app/mcp' }],
    })
    expect(manifest.packages).toBeUndefined()
  })
})
