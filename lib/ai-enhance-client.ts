import type { OfferItem } from './agent-page'

export type AiEnhanceOperation = 'enhance_description' | 'enhance_offers' | 'optimize_offers' | 'authorize'

export class AiEnhanceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AiEnhanceRequestError'
  }
}

export async function requestAiEnhancement(input: {
  operation: AiEnhanceOperation
  pageId: string
  businessName: string
  audience: string
  description?: string
  offers?: OfferItem[]
  fetchImpl?: typeof fetch
}): Promise<{
  authorized?: boolean
  enhanced?: string
  offers?: OfferItem[]
  source?: 'llm' | 'deterministic'
}> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl('/api/ai/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: input.operation,
      pageId: input.pageId,
      businessName: input.businessName,
      audience: input.audience,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.offers !== undefined ? { offers: input.offers } : {}),
    }),
  })
  const data = await response.json().catch(() => ({})) as {
    error?: string
    code?: string
    authorized?: boolean
    enhanced?: string
    offers?: OfferItem[]
    source?: 'llm' | 'deterministic'
  }
  if (!response.ok) {
    throw new AiEnhanceRequestError(
      data.error || 'AI optimization could not be completed.',
      response.status,
      data.code,
    )
  }
  return data
}
