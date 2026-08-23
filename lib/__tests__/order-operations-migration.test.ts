import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const foundation = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260823220917_order_operations.sql'),
  'utf8',
)
const hardening = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260823222618_order_operations_hardening.sql'),
  'utf8',
)
const migration = `${foundation}\n${hardening}`

describe('order operations migration', () => {
  it('keeps fulfillment and activity private with owner-only reads', () => {
    for (const table of ['checkout_order_fulfillments', 'checkout_order_events']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toMatch(new RegExp(`revoke all on public\\.${table} from anon, authenticated`))
      expect(migration).toContain(`create policy ${table}_owner_select`)
    }
    expect(migration.match(/using \(\(select auth\.uid\(\)\) = owner_id\)/g)).toHaveLength(2)
  })

  it('makes the event ledger append-only even for the service role', () => {
    expect(migration).toContain('before update or delete on public.checkout_order_events')
    expect(migration).toContain("raise exception 'checkout order events are append-only'")
    expect(migration).toContain('grant select, insert on public.checkout_order_events to service_role')
    expect(foundation).not.toContain('grant select, insert, update, delete on public.checkout_order_events')
    expect(hardening).toContain('revoke update, delete on public.checkout_order_events from service_role')
  })

  it('keeps the transition RPC service-role only and invoker-scoped', () => {
    expect(migration).toMatch(/create function public\.transition_checkout_order_fulfillment[\s\S]+?security invoker/)
    expect(migration).toContain('revoke all on function public.transition_checkout_order_fulfillment')
    expect(migration).toMatch(/grant execute on function public\.transition_checkout_order_fulfillment[\s\S]+?to service_role/)
    expect(migration).not.toMatch(/grant execute on function public\.transition_checkout_order_fulfillment[\s\S]+?to authenticated/)
  })

  it('requires a paid money state and blocks commitment-stage fulfillment', () => {
    expect(migration).toContain("target_order.status not in ('paid', 'dispute_won')")
    expect(migration).toContain("if obligation_kind = 'commitment'")
    expect(migration).toContain('commitment payments do not represent fulfilled work')
    expect(migration).toContain("if obligation_kind is distinct from 'commitment'")
  })

  it('synchronizes linked resource state inside the fulfillment transaction', () => {
    expect(migration).toContain('if target_order.resource_hold_id is not null')
    expect(migration).toContain('update public.resource_reservations')
    expect(migration).toContain("case when p_status = 'fulfilled' then 'fulfilled' else 'committed' end")
  })

  it('backfills durable payment evidence without inventing historical fulfillment', () => {
    const backfill = foundation.split('-- Existing orders prove payment, but not historical fulfillment.')[1] || ''
    expect(backfill).toContain("'order_recorded'")
    expect(backfill).toContain("'payment_confirmed'")
    expect(backfill).not.toContain('insert into public.checkout_order_fulfillments')
  })
})
