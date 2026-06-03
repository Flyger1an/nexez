import { describe, expect, it, afterEach } from 'vitest'
import { llmExtractOffers } from '../importer'

describe('llmExtractOffers (gated)', () => {
  afterEach(() => { delete process.env.LLM_API_KEY })
  it('returns [] when LLM not configured', async () => {
    delete process.env.LLM_API_KEY
    expect(await llmExtractOffers('<html><body>Some services here</body></html>')).toEqual([])
  })
  it('returns [] for trivially short content even if configured', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    expect(await llmExtractOffers('<p>hi</p>')).toEqual([])
  })
})
