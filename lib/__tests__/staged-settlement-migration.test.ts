import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260821022911_staged_settlement_obligation_ledger.sql'),
  'utf8',
)

describe('staged settlement obligation ledger migration', () => {
  it('keeps both agreement and obligation tables private by default', () => {
    for (const table of ['staged_settlement_agreements', 'staged_settlement_obligations']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`revoke all on public.${table} from anon`)
      expect(migration).toContain(`revoke all on public.${table} from authenticated`)
    }
  })

  it('allows owners to read and reserves all writes for the service role', () => {
    expect(migration).toContain('using ((select auth.uid()) = owner_id)')
    expect(migration).toContain('agreement.owner_id = (select auth.uid())')
    expect(migration).toContain('grant select, insert, update, delete on public.staged_settlement_agreements to service_role')
    expect(migration).toContain('grant select, insert, update, delete on public.staged_settlement_obligations to service_role')
  })

  it('enforces one payable obligation and sequential paid predecessors', () => {
    expect(migration).toContain('staged_settlement_one_payable_obligation_uidx')
    expect(migration).toContain("where status in ('ready_for_buyer_approval', 'payment_pending')")
    expect(migration).toContain("predecessor.status <> 'paid'")
    expect(migration).toContain('invalid staged settlement obligation transition')
  })

  it('freezes agreement and obligation economics after payment starts', () => {
    expect(migration).toContain('staged settlement contract is immutable after its first payment')
    expect(migration).toContain('staged settlement obligation contract fields are immutable')
    expect(migration).toContain("obligation.status in ('paid', 'refunded', 'disputed')")
  })

  it('links every stage payment back through the existing order ledger', () => {
    expect(migration).toContain('staged_settlement_agreement_id')
    expect(migration).toContain('staged_settlement_obligation_id')
    expect(migration).toContain("'staged_settlement'")
    expect(migration).toContain('checkout_orders_staged_obligation_uidx')
  })
})
