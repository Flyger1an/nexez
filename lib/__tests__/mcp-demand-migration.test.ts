import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260825134745_mcp_demand_attribution.sql'),
  'utf8',
)

describe('MCP demand attribution migration', () => {
  it('keeps the ledger private and service-role append-only', () => {
    expect(migration).toContain('alter table public.mcp_demand_events enable row level security')
    expect(migration).toContain('revoke all privileges on table public.mcp_demand_events from public, anon, authenticated')
    expect(migration).toContain('revoke all privileges on table public.mcp_demand_events from service_role')
    expect(migration).toContain('grant select, insert on table public.mcp_demand_events to service_role')
    expect(migration).not.toMatch(/grant\s+(update|delete)/i)
  })

  it('contains no raw request or identity columns', () => {
    expect(migration).not.toMatch(/^\s*(prompt|query|request_text|buyer_email|buyer_name|ip_address|user_agent|headers|merchant_id)\s+\w+/im)
    expect(migration).toContain('attribution_id uuid')
  })
})
