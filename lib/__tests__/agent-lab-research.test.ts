import { describe, expect, it } from 'vitest'
import { researchEvidence, researchRowToRun, researchTargetUrl, targetHost } from '../agent-lab-research'

describe('Agent Lab research records', () => {
  it('publishes explicit execution, storage, and commerce boundaries', () => {
    const evidence = researchEvidence('competitor_benchmark', { cacheHit: true, llmExecuted: true })
    expect(evidence.execution).toEqual({ boundary: 'server', method: 'deterministic_with_llm', llmExecuted: true })
    expect(evidence.source).toEqual({ fetch: 'respectful_public_web', rawHtmlStored: false, cache: 'process_hit' })
    expect(evidence.storage).toMatchObject({ scope: 'private_owner_workspace', immutable: true, savedByExplicitChoice: true })
    expect(evidence.commerce.transactionsExecuted).toBe(0)
    expect(evidence.commerce.notice).toMatch(/No checkout, payment, booking/i)
  })

  it('maps database rows without leaking owner identifiers to the browser', () => {
    const row = {
      id: 'run-1',
      kind: 'url_snapshot' as const,
      target_url: 'https://www.example.com/path',
      target_host: 'example.com',
      compared_page_id: null,
      compared_page_slug: null,
      result: {} as any,
      evidence: researchEvidence('url_snapshot'),
      created_at: '2026-08-21T00:00:00.000Z',
    }
    expect(researchRowToRun(row)).toMatchObject({ id: 'run-1', targetUrl: row.target_url, targetHost: 'example.com' })
    expect(researchRowToRun(row)).not.toHaveProperty('ownerId')
  })

  it('normalizes a display host safely', () => {
    expect(targetHost('https://www.Example.com/path')).toBe('example.com')
    expect(targetHost('example.com/pricing')).toBe('example.com')
  })

  it('strips credentials, query parameters, and fragments before persistence', () => {
    expect(researchTargetUrl('https://user:pass@example.com/pricing?token=secret#offer')).toBe('https://example.com/pricing')
  })
})
