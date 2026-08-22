import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260822180119_checkout_session_privacy_cleanup.sql'),
  'utf8',
)

describe('checkout-session privacy cleanup migration', () => {
  it('scrubs only declared buyer identity keys after session expiry', () => {
    expect(migration).toContain("session.expires_at <= now()")
    expect(migration).toContain("array['email', 'name', 'reference', 'agent']")
    expect(migration).toContain("session.buyer - array['email', 'name', 'reference', 'agent']::text[]")
  })

  it('deletes only incomplete sessions without payment or settlement lineage', () => {
    expect(migration).toContain("session.status in ('pending', 'ready', 'canceled', 'expired')")
    expect(migration).not.toContain("session.status in ('pending', 'ready', 'completed'")
    expect(migration).toContain('session.stripe_payment_intent_id is null')
    expect(migration).toContain('from public.checkout_orders as order_record')
    expect(migration).toContain('from public.staged_settlement_obligations as obligation')
  })

  it('keeps the cleanup private, bounded, and scheduled through pg_cron functions', () => {
    expect(migration).toContain('p_batch_size integer default 1000')
    expect(migration).toContain('limit p_batch_size')
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('revoke all on function private.nz_cleanup_expired_checkout_sessions(integer)')
    expect(migration).toContain("perform cron.schedule(")
    expect(migration).toContain("'nexez_cleanup_expired_checkout_sessions'")
  })
})
