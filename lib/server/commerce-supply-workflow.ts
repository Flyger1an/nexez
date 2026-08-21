import 'server-only'

import type { MarketplaceCurationQueue } from '../marketplace-curation'
import {
  COMMERCE_SUPPLY_CAMPAIGN_STATUSES,
  type CommerceSupplyCampaign,
  type CommerceSupplyCampaignStatus,
} from '../commerce-supply-campaign'
import { buildCommerceSupplyPriorities } from '../commerce-supply-priority'
import {
  buildCommerceSupplyWorkflow,
  type CommerceSupplyWorkflowSnapshot,
} from '../commerce-supply-workflow'
import type { CommerceDemandSnapshot } from '../commerce-demand'
import { captureError } from '../observability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getCommerceDemandSnapshot } from './commerce-demand'

const MAX_CAMPAIGNS = 500

type CampaignRow = {
  reference_id: string
  reference_domain: CommerceSupplyCampaign['referenceDomain']
  status: CommerceSupplyCampaignStatus
  decision_reason: string
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}
export class CommerceSupplyCampaignError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'not_found' | 'invalid' | 'conflict' | 'forbidden' | 'persistence_failed',
  ) {
    super(message)
    this.name = 'CommerceSupplyCampaignError'
  }
}

export async function getCommerceSupplyWorkflowSnapshot(
  demand: CommerceDemandSnapshot,
  marketplace: MarketplaceCurationQueue,
): Promise<CommerceSupplyWorkflowSnapshot> {
  if (!hasSupabaseAdminEnv()) {
    return buildCommerceSupplyWorkflow({
      demand,
      marketplaceItems: marketplace.items,
      available: false,
    })
  }

  try {
    const { data, error } = await createAdminClient()
      .from('commerce_supply_campaigns')
      .select('reference_id,reference_domain,status,decision_reason,created_by,updated_by,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(MAX_CAMPAIGNS)
      .returns<CampaignRow[]>()
    if (error) throw error

    return buildCommerceSupplyWorkflow({
      demand,
      campaigns: (data ?? []).map(mapCampaign),
      marketplaceItems: marketplace.items,
      available: true,
    })
  } catch (error) {
    captureError(error instanceof Error ? error : new Error('Commerce supply workflow failed'), {
      scope: 'commerce-supply-workflow:snapshot',
    })
    return buildCommerceSupplyWorkflow({
      demand,
      marketplaceItems: marketplace.items,
      available: false,
    })
  }
}

export async function applyCommerceSupplyCampaign(input: {
  referenceId: string
  status: CommerceSupplyCampaignStatus
  reason: string
  actorId: string
  idempotencyKey: string
}): Promise<CommerceSupplyCampaign> {
  if (!hasSupabaseAdminEnv()) {
    throw new CommerceSupplyCampaignError('Commerce supply campaigns are not configured.', 'not_configured')
  }
  if (!COMMERCE_SUPPLY_CAMPAIGN_STATUSES.includes(input.status)) {
    throw new CommerceSupplyCampaignError('Choose a valid campaign status.', 'invalid')
  }

  const demand = await getCommerceDemandSnapshot()
  const priority = buildCommerceSupplyPriorities(demand)
    .find((item) => item.referenceId === input.referenceId)
  if (!priority) {
    throw new CommerceSupplyCampaignError(
      'This category is no longer an unresolved Commerce supply priority. Refresh Launch Control.',
      'not_found',
    )
  }

  const { data, error } = await createAdminClient()
    .rpc('nz_apply_commerce_supply_campaign', {
      p_reference_id: priority.referenceId,
      p_reference_domain: priority.domain,
      p_status: input.status,
      p_reason: input.reason.trim(),
      p_actor_id: input.actorId,
      p_idempotency_key: input.idempotencyKey,
      p_observed_count: priority.observed,
      p_live_count: priority.live,
      p_related_count: priority.related,
      p_reference_count: priority.reference,
      p_unresolved_count: priority.unresolved,
    })
    .single<CampaignRow>()

  if (error || !data) throw mapPersistenceError(error)
  return mapCampaign(data)
}

function mapCampaign(row: CampaignRow): CommerceSupplyCampaign {
  return {
    referenceId: row.reference_id,
    referenceDomain: row.reference_domain,
    status: row.status,
    decisionReason: row.decision_reason,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPersistenceError(error: { code?: string; message?: string } | null): CommerceSupplyCampaignError {
  const code = error?.code
  if (code === '42P01' || code === '42883' || code === 'PGRST202') {
    return new CommerceSupplyCampaignError('Commerce supply campaigns are not configured.', 'not_configured')
  }
  if (code === '42501') {
    return new CommerceSupplyCampaignError('Platform administrator access is required.', 'forbidden')
  }
  if (code === '22023') {
    return new CommerceSupplyCampaignError(error?.message || 'The campaign transition is invalid.', 'invalid')
  }
  if (code === '23505') {
    return new CommerceSupplyCampaignError(error?.message || 'The campaign request conflicts with an earlier action.', 'conflict')
  }
  return new CommerceSupplyCampaignError('The campaign transition could not be saved.', 'persistence_failed')
}
