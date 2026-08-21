import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({ client: true })),
}))

vi.mock('@supabase/ssr', () => ({ createBrowserClient }))

import { createClient } from '../client'

describe('browser Supabase client', () => {
  beforeEach(() => {
    createBrowserClient.mockClear()
  })

  it('opts into the experimental passkey API', () => {
    createClient()

    expect(createBrowserClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      expect.objectContaining({ auth: { experimental: { passkey: true } } }),
    )
  })
})
