// Persist a confirmation's identity before sending money requests. Failed or lost
// responses retain it across reloads; only a confirmed success clears the intent.
type RefundBody = { orderId?: string; negotiationId?: string; action?: string; amount?: number }
type RefundIntent = { operationId: string; request: string }

export async function requestRefund(path: string, body: RefundBody): Promise<Response> {
  const key = `nexez:refund:v1:${body.orderId ? 'order' : 'negotiation'}:${body.orderId || body.negotiationId}`
  const request = JSON.stringify({ amount: body.amount ?? null })
  const saved = window.localStorage.getItem(key)
  const intent: RefundIntent = saved ? JSON.parse(saved) : { operationId: crypto.randomUUID(), request }
  if (intent.request !== request) throw new Error('Retry the previous refund amount to confirm its outcome before starting another refund.')
  // Fail before fetch if storage is unavailable. An in-memory fallback would lose
  // the operation's identity on reload after an uncertain provider response.
  window.localStorage.setItem(key, JSON.stringify(intent))
  const response = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, operationId: intent.operationId }),
  })
  const result = await response.clone().json().catch(() => null)
  if (response.status === 200 && result?.ok === true && result.operationId === intent.operationId
    && window.localStorage.getItem(key) === JSON.stringify(intent)) {
    window.localStorage.removeItem(key)
  }
  return response
}
