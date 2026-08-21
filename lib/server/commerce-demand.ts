import 'server-only'

import { after } from 'next/server'
import {
  buildCommerceDemandSignalRow,
  emptyCommerceDemandSnapshot,
  summarizeCommerceDemandSignals,
  type CommerceDemandSignalInput,
  type CommerceDemandSignalRow,
  type CommerceDemandSnapshot,
} from '../commerce-demand'
import { commerceReferenceCandidates } from '../commerce-templates/curation'
import { captureError } from '../observability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

const DEMAND_WINDOW_DAYS = 30
const MAX_DEMAND_ROWS = 5_000

export async function persistCommerceDemandSignal(
  input: CommerceDemandSignalInput,
): Promise<void> {
  if (!hasSupabaseAdminEnv()) return
  const row = buildCommerceDemandSignalRow(input)
  if (!row) return

  try {
    const { error } = await createAdminClient()
      .from('commerce_demand_signals')
      .insert(row)
    if (error) captureError(error, { route: 'public-simulate', op: 'persist_commerce_demand_signal' })
  } catch (error) {
    captureError(error, { route: 'public-simulate', op: 'persist_commerce_demand_signal' })
  }
}

/** Keep public simulator latency independent from telemetry persistence. */
export function scheduleCommerceDemandSignal(input: CommerceDemandSignalInput): void {
  try {
    after(() => persistCommerceDemandSignal(input))
  } catch {
    // Unit tests and scripts may execute outside a Next request scope.
    void persistCommerceDemandSignal(input)
  }
}

export async function getCommerceDemandSnapshot(): Promise<CommerceDemandSnapshot> {
  const generatedAt = new Date().toISOString()
  const since = new Date(
    Date.parse(generatedAt) - DEMAND_WINDOW_DAYS * 24 * 60 * 60_000,
  ).toISOString()
  if (!hasSupabaseAdminEnv()) return emptyCommerceDemandSnapshot(generatedAt, since)

  try {
    const { data, error } = await createAdminClient()
      .from('commerce_demand_signals')
      .select('id,created_at,surface,mode,intent,reference_id,reference_domain')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_DEMAND_ROWS + 1)
      .returns<CommerceDemandSignalRow[]>()
    if (error) throw error
    const rows = data ?? []
    const truncated = rows.length > MAX_DEMAND_ROWS
    return summarizeCommerceDemandSignals(
      rows.slice(0, MAX_DEMAND_ROWS),
      commerceReferenceCandidates,
      generatedAt,
      since,
      truncated,
    )
  } catch (error) {
    captureError(error instanceof Error ? error : new Error('Commerce demand snapshot failed'), {
      scope: 'commerce-demand:snapshot',
    })
    return emptyCommerceDemandSnapshot(generatedAt, since)
  }
}
