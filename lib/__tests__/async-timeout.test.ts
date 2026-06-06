import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from '../async-timeout'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('passes through a value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('passes through a rejection from the underlying promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })

  it('rejects with the timeout message when the promise never settles', async () => {
    vi.useFakeTimers()
    const pending = new Promise<string>(() => {}) // never settles
    const guarded = withTimeout(pending, 5000, 'Timed out loading negotiations.')
    const assertion = expect(guarded).rejects.toThrow('Timed out loading negotiations.')
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('works with a thenable (e.g. a query builder)', async () => {
    const thenable: PromiseLike<number> = {
      then: (onfulfilled) => Promise.resolve(42).then(onfulfilled),
    }
    await expect(withTimeout(thenable, 1000)).resolves.toBe(42)
  })
})
