import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8').toLowerCase()
}

describe('seller mobile data access contract', () => {
  it('keeps buyer-request reads owner-scoped and routes writes through the server role', () => {
    const foundation = source('supabase/migrations/20260626000400_buyer_order_portal.sql')
    const hardening = source('supabase/migrations/20260830171259_seller_mobile_phase1_access_contract.sql')
    const mobileData = source('apps/seller-mobile/src/lib/data.ts')
    const mobileApi = source('apps/seller-mobile/src/lib/api.ts')

    expect(foundation).toContain('alter table public.order_requests enable row level security')
    expect(foundation).toContain('using ((select auth.uid()) = owner_id)')
    expect(hardening).toContain('revoke update on table public.order_requests from authenticated')
    expect(hardening).toContain('grant select on table public.order_requests to authenticated')
    expect(hardening).toContain('grant select, update on table public.order_requests to service_role')
    expect(mobileData).not.toMatch(/\.from\(\s*['"]order_requests['"]\s*\)[\s\S]{0,80}?\.update\(/)
    expect(mobileData).not.toContain('resolveorderrequest')
    expect(mobileApi).toContain('mobile_platform_api_paths.orderrequeststatus')
  })

  it('keeps public-identifier claim data private and availability service-only', () => {
    const identifiers = source('supabase/migrations/20260825200808_secure_public_identifiers.sql')

    expect(identifiers).toContain('alter table private.public_identifier_claims enable row level security')
    expect(identifiers).toContain('revoke all on table private.public_identifier_claims from public, anon, authenticated, service_role')
    expect(identifiers).toContain('revoke all on function public.nz_public_identifier_availability(text, text, uuid, uuid)')
    expect(identifiers).toContain('from public, anon, authenticated')
    expect(identifiers).toContain('grant execute on function public.nz_public_identifier_availability(text, text, uuid, uuid)')
    expect(identifiers).toContain('to service_role')
  })

  it('keeps listing reads and writes behind authenticated owner policies', () => {
    const grants = source('supabase/migrations/20260613000000_harden_mvp_schema_and_events.sql')
    const policies = source('supabase/migrations/20260822185040_rebuild_plan_entitlement_contract.sql')

    expect(grants).toContain('grant select, insert, update, delete on public.pages to authenticated')
    expect(policies).toContain('create policy "owners and entitled collaborators read pages"')
    expect(policies).toContain('create policy "owners and entitled editor collaborators update pages"')
    expect(policies).toContain('(select auth.uid()) = owner_id')
  })

  it('keeps every new mobile server path backed by a Route Handler', () => {
    expect(() => source('app/api/public-identifiers/availability/route.ts')).not.toThrow()
    expect(() => source('app/api/orders/request-status/route.ts')).not.toThrow()
  })

  it('keeps negotiation, escrow, refund, and request mutations under owner-scoped server authority', () => {
    const mobileData = source('apps/seller-mobile/src/lib/data.ts')
    const mobileApi = source('apps/seller-mobile/src/lib/api.ts')
    const routeContracts = [
      ['app/api/negotiations/transition/route.ts', ".eq('owner_id', user.id)"],
      ['app/api/negotiations/escrow/route.ts', ".eq('owner_id', user.id)"],
      ['app/api/orders/refund/route.ts', ".from('checkout_orders')"],
      ['app/api/orders/request-status/route.ts', ".eq('owner_id', user.id)"],
    ]

    expect(mobileData).not.toMatch(/\.from\(\s*['"]agent_negotiations['"]\s*\)[\s\S]{0,120}?\.update\(/)
    expect(mobileData).not.toMatch(/\.from\(\s*['"]checkout_orders['"]\s*\)[\s\S]{0,120}?\.update\(/)
    expect(mobileData).not.toMatch(/\.from\(\s*['"]order_requests['"]\s*\)[\s\S]{0,120}?\.update\(/)
    expect(mobileApi).toContain('mobile_platform_api_paths.negotiationtransition')
    expect(mobileApi).toContain('mobile_platform_api_paths.negotiationescrow')
    expect(mobileApi).toContain('mobile_platform_api_paths.orderrefund')
    expect(mobileApi).toContain('mobile_platform_api_paths.orderrequeststatus')

    for (const [path, ownershipBoundary] of routeContracts) {
      const route = source(path)
      expect(route).toContain('resolverequestauth')
      expect(route).toContain(ownershipBoundary)
    }
  })
})
