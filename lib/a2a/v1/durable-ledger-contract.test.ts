import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const migrationPaths = [
  'supabase/migrations/20260901030000_a2a_v1_durable_ledger.sql',
  'supabase/migrations/20260901030100_a2a_v1_task_acceptance.sql',
  'supabase/migrations/20260901030200_a2a_v1_task_events.sql',
]
const sql = migrationPaths.map((path) => readFileSync(path, 'utf8')).join('\n')

describe('A2A v1 durable ledger migration contract', () => {
  it('keeps protocol execution separate from standing-search tasks', () => {
    expect(sql).toContain('create table public.a2a_tasks')
    expect(sql).toContain('create table public.a2a_message_receipts')
    expect(sql).toContain('create table public.a2a_task_events')
    expect(sql).not.toContain('alter table public.agent_tasks')
  })

  it('stores v1 task enums and one-of stream response wrappers', () => {
    expect(sql).toContain("protocol_version text not null default '1.0'")
    expect(sql).toContain("'TASK_STATE_SUBMITTED'")
    expect(sql).toContain("'TASK_STATE_INPUT_REQUIRED'")
    expect(sql).toContain("'artifactUpdate'")
    expect(sql).toContain("'statusUpdate'")
    expect(sql).not.toMatch(/["']kind["']/)
    expect(sql).not.toMatch(/["']final["']/)
    expect(sql).not.toContain('a2a-v0.3')
  })

  it('exposes no direct ledger table access', () => {
    for (const table of ['a2a_tasks', 'a2a_message_receipts', 'a2a_task_events']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(
        `revoke all on table public.${table}\n  from public, anon, authenticated, service_role`,
      )
    }
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)[\s\S]*?a2a_/i)
  })

  it('binds receipts and events to the same task owner', () => {
    expect(sql.match(/foreign key \(task_id, owner_id\)[\s\S]*?references public\.a2a_tasks\(id, owner_id\)/gi)).toHaveLength(2)
    expect(sql).toMatch(
      /api_key_id uuid references public\.api_keys\(id\) on delete set null/i,
    )
    expect(sql).toContain("request_hash ~ '^[0-9a-f]{64}$'")
  })

  it('uses bounded service-role-only RPCs with fixed search paths', () => {
    for (const name of [
      'nz_a2a_v1_accept_message',
      'nz_a2a_v1_claim_task',
      'nz_a2a_v1_get_task',
      'nz_a2a_v1_list_events',
      'nz_a2a_v1_get_execution_context',
      'nz_a2a_v1_append_event',
      'nz_a2a_v1_cancel_task',
      'nz_a2a_v1_fail_execution',
      'nz_a2a_v1_reconcile_task',
    ]) {
      expect(sql).toMatch(
        new RegExp(`create function public\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i'),
      )
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i'),
      )
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to service_role`, 'i'),
      )
    }
  })

  it('fails expired workers closed instead of replaying them', () => {
    expect(sql).toContain("v_code text := 'worker_lease_expired'")
    expect(sql).toContain('Create a new task to try again.')
    expect(sql).not.toMatch(/worker_lease_expired[\s\S]{0,500}TASK_STATE_SUBMITTED/i)
  })

  it('keeps cancellation distinct from commerce reversal and remote approval', () => {
    expect(sql).toContain('create function public.nz_a2a_v1_cancel_task')
    expect(sql).toContain("'TASK_STATE_CANCELED'")
    expect(sql).toContain("'nexez:canceledBy', 'a2a-client'")
    expect(sql).not.toMatch(/approvalDecision|executeApproval|approved/i)
  })
})
