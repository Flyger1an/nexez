import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260825160000_add_protocol_credential_evidence.sql',
  'utf8',
)

describe('protocol credential evidence migration', () => {
  it('adds the token-free event without widening event-table write permissions', () => {
    expect(migration).toContain("'protocol_credential_confirmed'")
    expect(migration).not.toMatch(/grant\s+/i)
    expect(migration).not.toMatch(/credential(token|_token)/i)
  })
})
