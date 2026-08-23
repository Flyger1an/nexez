import { describe, expect, it } from 'vitest'
import { agentMemoryCopy } from './agent-memory-copy'

describe('agent memory privacy copy', () => {
  it('matches the private workspace and public-projection contract', () => {
    const copy = JSON.stringify(agentMemoryCopy)
    expect(agentMemoryCopy.status).toBe('Workspace-private')
    expect(copy).toMatch(/listing owner and authorized collaborators/i)
    expect(copy).toMatch(/not included.*public listing.*agent\.json/i)
    expect(copy).toMatch(/not published.*agent\.json.*public listing/i)
    expect(copy).toMatch(/Do not store sensitive buyer personal data/i)
    expect(copy).not.toMatch(/readable by anyone/i)
  })
})
