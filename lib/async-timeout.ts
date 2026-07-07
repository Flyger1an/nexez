/**
 * Reject if a promise (or thenable - e.g. a Supabase query builder) doesn't
 * settle within `ms`. Keeps loading UIs from spinning forever when a network
 * call stalls without ever resolving or rejecting.
 *
 * If the underlying promise settles first, its result/rejection is passed
 * through and the timer is cleared.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message = 'Request timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
