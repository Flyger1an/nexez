import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260821234835_add_agent_lab_research_runs.sql'),
  'utf8',
)

describe('Agent Lab research runs migration', () => {
  it('stores only bounded, summarized research records', () => {
    expect(migration).toContain('create table public.agent_lab_research_runs')
    expect(migration).toContain("kind in ('url_snapshot', 'competitor_benchmark')")
    expect(migration).toContain('result jsonb not null')
    expect(migration).toContain('evidence jsonb not null')
    expect(migration).not.toMatch(/raw_html|page_html|fetched_html/i)
  })

  it('explicitly exposes only owner-safe operations to the Data API', () => {
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('force row level security')
    expect(migration).toContain('revoke all on public.agent_lab_research_runs from anon')
    expect(migration).toContain('grant select, insert, delete on public.agent_lab_research_runs to authenticated')
    expect(migration).not.toContain('grant select, insert, update, delete on public.agent_lab_research_runs')
    expect(migration).not.toContain('agent_lab_research_runs_owner_update')
  })

  it('isolates owners and validates any linked comparison page', () => {
    expect(migration).toContain('using ((select auth.uid()) = owner_id)')
    expect(migration).toContain('(select auth.uid()) = owner_id')
    expect(migration).toContain('pages.owner_id = (select auth.uid())')
  })

  it('indexes owner history and owner-kind history in descending time order', () => {
    expect(migration).toContain('(owner_id, created_at desc)')
    expect(migration).toContain('(owner_id, kind, created_at desc)')
  })
})
