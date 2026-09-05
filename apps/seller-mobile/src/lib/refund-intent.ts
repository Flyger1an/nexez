import AsyncStorage from '@react-native-async-storage/async-storage'

function operationId() {
  // react-native-get-random-values is initialized by the Supabase module.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 15) | 64
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const inFlight = new Map<string, { request: string; task: Promise<unknown> }>()

export function withRefundIntent<T extends { ok?: boolean; operationId?: string }>(
  target: string,
  body: { amount?: number },
  send: (body: object) => Promise<T>,
): Promise<T> {
  const key = `nexez:refund:v1:${target}`
  const request = JSON.stringify({ amount: body.amount ?? null })
  // A second tap shares the original request while async storage is being read.
  const pending = inFlight.get(key)
  if (pending) {
    if (pending.request !== request) return Promise.reject(new Error('A different refund is still in progress.'))
    return pending.task as Promise<T>
  }
  const task = (async () => {
    const saved = await AsyncStorage.getItem(key)
    const intent = saved ? JSON.parse(saved) as { operationId: string; request: string } : { operationId: operationId(), request }
    if (intent.request !== request) throw new Error('Retry the previous refund amount to confirm its outcome before starting another refund.')
    await AsyncStorage.setItem(key, JSON.stringify(intent))
    const result = await send({ ...body, operationId: intent.operationId })
    if (result.ok === true && result.operationId === intent.operationId) await AsyncStorage.removeItem(key)
    return result
  })().finally(() => { inFlight.delete(key) })
  inFlight.set(key, { request, task })
  return task
}
