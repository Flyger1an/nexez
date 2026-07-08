import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../../../utils/supabase/server'
import { createAdminClient } from '../../../../../../../utils/supabase/admin'
import { gateIntegrationImport } from '../../../../../../../lib/server/integration-importers'
import { syncPageIntegration, isSyncProvider } from '../../../../../../../lib/server/integration-sync'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'

/**
 * One per-listing "Sync now" for every stored-credential integration
 * (calendly, shopify): pulls the seller's live catalog (and Calendly
 * availability) from the STORED per-page credential — never re-prompts for a
 * token. Owner/editor + Pro gated, rate-limited. Dormant without
 * INTEGRATION_SECRET_KEY; 400 if the provider isn't connected for this page.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; provider: string }> }) {
  const limited = await enforceRateLimit(request, 'integration-sync', 10, 60_000)
  if (limited) return limited

  const { id: pageId, provider } = await ctx.params
  if (!isSyncProvider(provider)) {
    return NextResponse.json({ error: 'Unsupported integration.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId,
    proMessage: 'Syncing integrations is a Pro feature. Upgrade to pull live catalogs + availability.',
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const admin = createAdminClient()
  const result = await syncPageIntegration(admin, provider, pageId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    imported: result.imported,
    windows: result.windows,
    availability_synced: result.availabilitySynced,
    note: result.note,
  })
}
