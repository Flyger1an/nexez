import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260821232408_add_agent_lab_simulation_runs.sql'),
  'utf8',
)

describe('Agent Lab simulation runs migration', () => {
  it('creates attributable, replayable run records instead of page JSON overwrites', () => {
    expect(migration).toContain('create table public.agent_lab_simulation_runs')
    expect(migration).toContain('engine_version text not null')
    expect(migration).toContain('result jsonb not null')
    expect(migration).toContain('evidence jsonb not null')
    expect(migration).toContain('references public.pages(id) on delete cascade')
  })

  it('keeps runs owner-scoped and anonymous callers out', () => {
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('force row level security')
    expect(migration).toContain('revoke all on public.agent_lab_simulation_runs from anon')
    expect(migration).toContain('using ((select auth.uid()) = owner_id)')
    expect(migration).toContain('pages.owner_id = (select auth.uid())')
  })

  it('allows append/read/delete but no authenticated mutation of saved evidence', () => {
    expect(migration).toContain('grant select, insert, delete on public.agent_lab_simulation_runs to authenticated')
    expect(migration).not.toContain('grant select, insert, update, delete on public.agent_lab_simulation_runs to authenticated')
    expect(migration).not.toContain('agent_lab_simulation_runs_owner_update')
  })

  it('indexes owner and listing history in descending creation order', () => {
    expect(migration).toContain('(owner_id, created_at desc)')
    expect(migration).toContain('(owner_id, page_id, created_at desc)')
  })
})
