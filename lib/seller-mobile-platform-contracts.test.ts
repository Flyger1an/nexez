import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MOBILE_ENTITLEMENT_FEATURE_KEYS,
  MOBILE_ENTITLEMENT_SCHEMA_VERSION,
  MOBILE_NEGOTIATION_STATUSES,
  MOBILE_NOTIFICATION_PAYLOAD_TYPES,
  MOBILE_OPEN_NEGOTIATION_STATUSES,
  MOBILE_PLAN_RANK,
  MOBILE_PLATFORM_API_PATHS,
} from '../apps/seller-mobile/src/lib/platform-contract-snapshot'
import { sellerNotificationDestination } from '../apps/seller-mobile/src/lib/notification-routing'
import {
  OWNER_PLAN_ENTITLEMENT_SCHEMA_VERSION,
  PLAN_FEATURES,
  billingPlans,
} from './billing'
import { NEGOTIATION_STATUSES } from './negotiations'
import { SELLER_NOTIFICATION_PAYLOAD_TYPES } from './seller-notification-policy'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('seller mobile platform contract snapshot', () => {
  it('keeps every mobile API dependency backed by a platform Route Handler', () => {
    const paths = Object.values(MOBILE_PLATFORM_API_PATHS)
    expect(new Set(paths).size).toBe(paths.length)

    for (const path of paths) {
      const routeFile = resolve(REPO_ROOT, `app${path}/route.ts`)
      expect(existsSync(routeFile), `Missing Route Handler for ${path}`).toBe(true)
    }
  })

  it('routes every canonical seller notification payload type', () => {
    expect([...MOBILE_NOTIFICATION_PAYLOAD_TYPES]).toEqual([...SELLER_NOTIFICATION_PAYLOAD_TYPES])

    const expectedDestinations = {
      negotiation: '/inbox/negotiations',
      order: '/inbox/orders',
      listing: '/listings',
      page: '/listings',
      review: '/inbox/reviews',
      request: '/inbox/requests',
      buyer_request: '/inbox/requests',
      refund_request: '/inbox/requests',
      problem_report: '/inbox/requests',
      finance: '/tools/finance',
      refund: '/tools/finance',
      dispute: '/tools/finance',
      payout: '/tools/finance',
    } as const

    for (const type of SELLER_NOTIFICATION_PAYLOAD_TYPES) {
      expect(sellerNotificationDestination({ type })).toBe(expectedDestinations[type])
    }
  })

  it('keeps entitlement version, plan ranks, and feature keys synchronized', () => {
    expect(MOBILE_ENTITLEMENT_SCHEMA_VERSION).toBe(OWNER_PLAN_ENTITLEMENT_SCHEMA_VERSION)
    expect(MOBILE_PLAN_RANK).toEqual(Object.fromEntries(billingPlans.map((plan) => [plan.id, plan.rank])))
    expect([...MOBILE_ENTITLEMENT_FEATURE_KEYS].sort()).toEqual([...PLAN_FEATURES].sort())
  })

  it('keeps the TypeScript entitlement version synchronized with the latest SQL resolver', () => {
    const migrationsDir = resolve(REPO_ROOT, 'supabase/migrations')
    const resolverMigrations = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .filter((file) => readFileSync(resolve(migrationsDir, file), 'utf8')
        .includes('create or replace function private.nz_owner_plan_entitlements'))

    expect(resolverMigrations.length).toBeGreaterThan(0)
    const latest = resolverMigrations.at(-1)!
    const source = readFileSync(resolve(migrationsDir, latest), 'utf8')
    const start = source.lastIndexOf('create or replace function private.nz_owner_plan_entitlements')
    const end = source.indexOf('revoke all on function private.nz_owner_plan_entitlements', start)
    const resolver = source.slice(start, end === -1 ? undefined : end)

    expect(resolver).toContain(`'schemaVersion', ${OWNER_PLAN_ENTITLEMENT_SCHEMA_VERSION}`)
  })

  it('keeps mobile negotiation status handling synchronized with the platform', () => {
    expect([...MOBILE_NEGOTIATION_STATUSES]).toEqual([...NEGOTIATION_STATUSES])
    expect(MOBILE_OPEN_NEGOTIATION_STATUSES.every((status) => NEGOTIATION_STATUSES.includes(status))).toBe(true)
  })
})
