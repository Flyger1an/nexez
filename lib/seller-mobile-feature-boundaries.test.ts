import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPETITOR_ANALYSIS_WEB_HANDOFF } from '../apps/seller-mobile/src/lib/web-handoffs'
import { safeNextPath } from './safe-redirect'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('seller mobile launch feature boundaries', () => {
  it('hands real competitor analysis to the canonical signed-in Agent Lab lens', () => {
    const handoff = new URL(COMPETITOR_ANALYSIS_WEB_HANDOFF, 'https://app.nexez.ai')
    expect(handoff.pathname).toBe('/login')
    expect(handoff.searchParams.get('next')).toBe('/simulator?mode=compare')
    expect(safeNextPath(handoff.searchParams.get('next'))).toBe('/simulator?mode=compare')

    const agentLab = source('app/simulator/SimulatorClient.tsx')
    const competitorUi = source('components/simulator/CompetitorCompare.tsx')
    const competitorRoute = source('app/api/analyze-competitor/route.ts')

    expect(agentLab).toContain("m === 'compare'")
    expect(competitorUi).toContain("fetch('/api/analyze-competitor'")
    expect(competitorRoute).toContain('supabase.auth.getUser()')
    expect(competitorRoute).toContain('resolveFeatureOwner({')
  })

  it('keeps the native comparison explicitly owner-portfolio scoped', () => {
    const mobileData = source('apps/seller-mobile/src/lib/data.ts')
    const mobileComparison = source('apps/seller-mobile/app/listing/[id]/competitor.tsx')

    expect(mobileData).toMatch(/getSellerPages[\s\S]*?\.eq\('owner_id', userId\)/)
    expect(mobileComparison).toContain('It does not use external competitor or market data.')
  })

  it('labels integration connections and team administration as web-managed', () => {
    const integrations = source('apps/seller-mobile/src/screens/IntegrationsScreen.tsx')
    const settings = source('apps/seller-mobile/src/screens/SettingsScreen.tsx')

    expect(integrations).toContain('Connections are managed on web')
    expect(integrations).toContain('live connector status open in the web dashboard')
    expect(settings).toContain('Managed on web: invitations, roles, and access')
  })
})
