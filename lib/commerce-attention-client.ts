'use client'

import {
  unavailableCommerceAttention,
  type CommerceAttentionSummary,
} from './commerce-attention'

type CommerceAttentionResponse = {
  attention?: CommerceAttentionSummary
}

export async function fetchCommerceAttention(): Promise<CommerceAttentionSummary | null> {
  try {
    const response = await fetch('/api/dashboard/commerce-attention', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (response.status === 401) return null
    if (!response.ok) return unavailableCommerceAttention
    const body = await response.json() as CommerceAttentionResponse
    return body.attention ?? unavailableCommerceAttention
  } catch {
    return unavailableCommerceAttention
  }
}
