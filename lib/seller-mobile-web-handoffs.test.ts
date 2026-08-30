import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOBILE_CONNECTOR_CATALOG } from '../apps/seller-mobile/src/lib/mobile-connector-catalog'
import { ACCOUNT_WEB_HANDOFFS, buildImporterHandoff } from '../apps/seller-mobile/src/lib/web-handoffs'

const ROUTE_FILES = new Map([
  ['/create', 'app/create/page.tsx'],
  ['/dashboard/billing', 'app/dashboard/billing/page.tsx'],
  ['/dashboard/integrations', 'app/dashboard/integrations/page.tsx'],
  ['/dashboard/settings', 'app/dashboard/settings/page.tsx'],
  ['/dashboard/shopify', 'app/dashboard/shopify/page.tsx'],
  ['/dashboard/tools', 'app/dashboard/tools/page.tsx'],
])

function routePath(handoff: string): string {
  return handoff.split(/[?#]/, 1)[0] ?? handoff
}

describe('seller mobile web handoff routes', () => {
  it('keeps every account and connector destination backed by a platform route', () => {
    const handoffs = [
      ...Object.values(ACCOUNT_WEB_HANDOFFS),
      ...Object.values(MOBILE_CONNECTOR_CATALOG).map((connector) => connector.webPath),
    ]

    for (const handoff of new Set(handoffs)) {
      const path = routePath(handoff)
      const routeFile = ROUTE_FILES.get(path)
      expect(routeFile, `Missing route contract for ${path}`).toBeDefined()
      expect(existsSync(resolve(process.cwd(), routeFile!)), `Missing route file for ${path}`).toBe(true)
    }
  })

  it('keeps importer handoffs on the canonical create route', () => {
    const handoff = buildImporterHandoff('https://example.com/catalog?season=fall')
    expect(handoff.ok).toBe(true)
    if (!handoff.ok) return

    expect(routePath(handoff.path)).toBe('/create')
    expect(existsSync(resolve(process.cwd(), ROUTE_FILES.get('/create')!))).toBe(true)
  })
})
