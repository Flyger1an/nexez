import { describe, it, expect } from 'vitest'

import { GET } from './route'

describe('GET /api/v1/health', () => {
  it('reports liveness without exposing privileged config state', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, service: 'nexez-api-v1' })
    expect(body).not.toHaveProperty('configured')
    expect(JSON.stringify(body)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY|configured/i)
  })
})
