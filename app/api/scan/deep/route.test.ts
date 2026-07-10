import { describe, it, expect, vi, beforeEach } from 'vitest'

let rateLimited = false
let user: { id: string } | null = { id: 'u1' }
let aiAllowed = true
let llmConfigured = true
const runDeepScan = vi.fn()

vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (rateLimited ? new Response('rate', { status: 429 }) : null)),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: vi.fn(async () => ({ data: { user } })) } })),
}))
vi.mock('../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => aiAllowed) }))
vi.mock('../../../../lib/llm', () => ({ isLlmConfigured: vi.fn(() => llmConfigured) }))
vi.mock('../../../../lib/observability', () => ({ captureEvent: vi.fn(), captureError: vi.fn() }))
vi.mock('../../../../lib/server/deep-scan', () => ({ runDeepScan: (...a: unknown[]) => runDeepScan(...a) }))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/scan/deep', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const okResult = (over: Record<string, unknown> = {}) => ({
  ok: true, url: 'https://acme.com/', origin: 'https://acme.com', elapsedMs: 50,
  score: 90, checks: [], agentBots: [], blockedBots: [], llmAssisted: true, ...over,
})

describe('POST /api/scan/deep (gated deep report)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimited = false
    user = { id: 'u1' }
    aiAllowed = true
    llmConfigured = true
  })

  it('429 when rate-limited (before any work)', async () => {
    rateLimited = true
    expect((await POST(post({ url: 'x.com' }))).status).toBe(429)
    expect(runDeepScan).not.toHaveBeenCalled()
  })

  it('401 when not signed in', async () => {
    user = null
    const res = await POST(post({ url: 'acme.com' }))
    expect(res.status).toBe(401)
    expect(runDeepScan).not.toHaveBeenCalled()
  })

  it('runs the LLM pass for an aiFeatures account (llm:true)', async () => {
    runDeepScan.mockResolvedValue(okResult({ llmAssisted: true, comprehension: { score: 60, agentRead: 'x', topFix: 'y' } }))
    const res = await POST(post({ url: 'acme.com' }))
    expect(res.status).toBe(200)
    expect(runDeepScan).toHaveBeenCalledWith('acme.com', { llm: true })
    const json = await res.json()
    expect(json.llmAssisted).toBe(true)
    expect(json.upgradeHint).toBeUndefined()
  })

  it('signed in but NOT aiFeatures → deterministic (llm:false) + upgradeHint, still 200 (funnel-friendly)', async () => {
    aiAllowed = false
    runDeepScan.mockResolvedValue(okResult({ llmAssisted: false }))
    const res = await POST(post({ url: 'acme.com' }))
    expect(res.status).toBe(200)
    expect(runDeepScan).toHaveBeenCalledWith('acme.com', { llm: false })
    const json = await res.json()
    expect(json.upgradeHint).toMatch(/upgrade/i)
  })

  it('aiFeatures allowed but LLM unconfigured → llm:false (no hard error)', async () => {
    llmConfigured = false
    runDeepScan.mockResolvedValue(okResult({ llmAssisted: false }))
    await POST(post({ url: 'acme.com' }))
    expect(runDeepScan).toHaveBeenCalledWith('acme.com', { llm: false })
  })

  it('400 when the deep scan rejects the URL (SSRF / bad input)', async () => {
    runDeepScan.mockResolvedValue({ error: 'Blocked private host' })
    const res = await POST(post({ url: 'http://169.254.169.254/' }))
    expect(res.status).toBe(400)
  })
})
