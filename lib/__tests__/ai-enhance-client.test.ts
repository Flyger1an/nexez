import { describe, expect, it, vi } from 'vitest'
import { AiEnhanceRequestError, requestAiEnhancement } from '../ai-enhance-client'

describe('requestAiEnhancement', () => {
  it.each(['enhance_description', 'enhance_offers', 'optimize_offers'] as const)(
    'surfaces a live plan downgrade for %s without a client fallback',
    async (operation) => {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        error: 'AI optimization is available on the Launch plan and above.',
        code: 'plan_upgrade_required',
      }), { status: 402 }))

      const request = requestAiEnhancement({
        operation,
        pageId: 'page-1',
        businessName: 'Acme',
        audience: 'Buyers',
        ...(operation === 'enhance_description'
          ? { description: 'Original summary' }
          : { offers: [{ name: 'Audit', price: '$99', description: 'Original offer', url: '' }] }),
        fetchImpl,
      })

      await expect(request).rejects.toMatchObject({
        status: 402,
        code: 'plan_upgrade_required',
      } satisfies Partial<AiEnhanceRequestError>)
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )
})
