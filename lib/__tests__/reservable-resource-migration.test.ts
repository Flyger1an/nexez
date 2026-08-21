import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260821035523_reservable_resource_runtime.sql'),
  'utf8',
)
const paymentProvenanceMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260821041532_reservable_resource_payment_provenance.sql'),
  'utf8',
)
const accountDeletionMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260821042935_reservable_resource_account_deletion.sql'),
  'utf8',
)

describe('reservable resource runtime migration', () => {
  it('enables RLS and denies anonymous table access throughout the ledger', () => {
    for (const table of [
      'resource_pools',
      'resource_pool_windows',
      'resource_holds',
      'resource_hold_allocations',
      'resource_reservations',
      'resource_allocation_events',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toMatch(new RegExp(`revoke all on public\\.${table} from anon`))
    }
  })

  it('keeps transaction RPCs service-role only', () => {
    for (const fn of [
      'acquire_resource_hold',
      'attach_resource_hold_payment',
      'release_resource_hold',
      'commit_resource_hold',
      'link_resource_reservation_order',
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}`)
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]+\\) to service_role`))
    }
  })

  it('locks every pool and counts active, attached, and committed allocations', () => {
    expect(migration).toContain('order by locked_pool.id')
    expect(migration).toContain('for update')
    expect(migration).toContain("hold.status in ('payment_pending', 'committed')")
    expect(migration).toContain("hold.status = 'active' and hold.expires_at > now()")
    expect(migration).toContain('allocated + requested > capacity')
  })

  it('protects payment-pending holds from clock-only release and supports delayed commit', () => {
    expect(migration).toContain("p_reason not in ('provider_expired', 'provider_failed', 'provider_cancelled')")
    expect(migration).toContain("hold.status <> 'payment_pending'")
    expect(migration).not.toContain("hold.status <> 'payment_pending' or hold.expires_at <= now()")
    expect(migration).toContain("set status = 'committed'")
  })

  it('binds resource provenance into the normal order ledger', () => {
    expect(migration).toContain('resource_hold_id uuid references public.resource_holds')
    expect(migration).toContain("'reservable_resource'")
    expect(migration).toContain('resource_reservations_checkout_order_fk')
  })

  it('binds exact payment amount and currency in the authoritative attachment RPC', () => {
    expect(paymentProvenanceMigration).toContain('p_amount_cents bigint')
    expect(paymentProvenanceMigration).toContain('p_currency text')
    expect(paymentProvenanceMigration).toContain('amount_cents = p_amount_cents')
    expect(paymentProvenanceMigration).toContain('currency = p_currency')
    expect(paymentProvenanceMigration).toMatch(
      /grant execute on function public\.attach_resource_hold_payment\([^;]+\)\s+to service_role/,
    )
  })

  it('allows account deletion to cascade through private hold ledger children', () => {
    for (const table of ['resource_hold_allocations', 'resource_reservations', 'resource_allocation_events']) {
      expect(accountDeletionMigration).toContain(`alter table public.${table}`)
    }
    expect(accountDeletionMigration.match(/references public\.resource_holds\(id\) on delete cascade/g)).toHaveLength(3)
    expect(accountDeletionMigration).toContain('references public.resource_pools(id) on delete cascade')
    expect(accountDeletionMigration.match(/on delete no action deferrable initially deferred/g)).toHaveLength(4)
  })
})
