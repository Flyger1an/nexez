import { describe, expect, it, vi } from 'vitest'

const redirect = vi.hoisted(() => vi.fn((location: string) => {
  throw new Error(`NEXT_REDIRECT:${location}`)
}))

vi.mock('next/navigation', () => ({ redirect }))

import LaunchControlPage from './page'

describe('legacy Launch Control entry point', () => {
  it('moves every viewer to the dedicated admin surface', async () => {
    await expect(LaunchControlPage()).rejects.toThrow('NEXT_REDIRECT:/admin/launch')
    expect(redirect).toHaveBeenCalledWith('/admin/launch')
  })
})
