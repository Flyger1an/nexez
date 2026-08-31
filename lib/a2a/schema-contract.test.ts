import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/20260831210000_a2a_durable_task_runtime.sql',
  'utf8',
)

describe('A2A durable schema contract', () => {
  it('uses dedicated task and event ledgers instead of the standing-search agent_tasks table', () => {
    expect(sql).toContain('create table public.a2a_tasks')
    expect(sql).toContain('create table public.a2a_task_events')
    expect(sql).not.toContain('alter table public.agent_tasks')
  })

  it('preserves historical tasks when an originating API key is deleted', () => {
    expect(sql).toMatch(/api_key_id uuid references public\.api_keys\(id\) on delete set null/i)
  })

  it('keeps browser roles out and makes receipts and events append-only', () => {
    expect(sql).toContain('revoke all on table public.a2a_tasks from public, anon, authenticated, service_role')
    expect(sql).toContain('nz_reject_a2a_event_mutation')
    expect(sql).toContain('nz_reject_a2a_receipt_mutation')
  })

  it('keeps the private artifact helper hidden behind the service-only append RPC', () => {
    expect(sql).toMatch(/private\.nz_a2a_apply_artifact[\s\S]*from public, anon, authenticated, service_role/i)
    expect(sql).toMatch(/create function public\.nz_a2a_append_event[\s\S]*security definer/i)
  })

  it('fails expired workers instead of reclaiming and replaying a side-effectful turn', () => {
    expect(sql).toContain("safe_error_code = 'worker_lease_expired'")
    expect(sql).toContain('Create a new task to try again.')
    expect(sql).not.toMatch(/state\s*=\s*'submitted'.*worker_lease_expired/is)
  })
})
