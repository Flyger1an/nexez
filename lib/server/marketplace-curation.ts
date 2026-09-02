import 'server-only'

import {
  assessMarketplacePage,
  canCertifyMarketplacePage,
  normalizeMarketplaceName,
  summarizeMarketplaceCuration,
  type MarketplaceCurationDecision,
  type MarketplaceCurationQueue,
  type MarketplaceCurationQueueItem,
  type MarketplaceCurationStatus,
} from '../marketplace-curation'
import { PUBLIC_PAGE_SELECT, type AgentPage } from '../agent-page'
import { captureError } from '../observability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

const MAX_CURATED_PAGES = 1_000

type CurationRow = {
  page_id: string
  status: MarketplaceCurationStatus
  decision_reason: string | null
  notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  certified_at: string | null
  updated_at: string | null
}

type PageOwnerRow = {
  id: string
  owner_id: string | null
}

export class MarketplaceCurationError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'not_found' | 'certification_blocked' | 'invalid_decision' | 'persistence_failed',
  ) {
    super(message)
    this.name = 'MarketplaceCurationError'
  }
}

function emptyQueue(generatedAt = new Date().toISOString()): MarketplaceCurationQueue {
  return {
    generatedAt,
    available: false,
    items: [],
    summary: {
      total: 0,
      unreviewed: 0,
      candidate: 0,
      certified: 0,
      excluded: 0,
      blockers: 0,
      warnings: 0,
      certifiedMerchants: 0,
    },
  }
}

function defaultDecision(pageId: string): MarketplaceCurationDecision {
  return {
    pageId,
    status: 'unreviewed',
    decisionReason: null,
    notes: null,
    reviewedBy: null,
    reviewedAt: null,
    certifiedAt: null,
    updatedAt: null,
  }
}

function mapDecision(row: CurationRow): MarketplaceCurationDecision {
  return {
    pageId: row.page_id,
    status: row.status,
    decisionReason: row.decision_reason,
    notes: row.notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    certifiedAt: row.certified_at,
    updatedAt: row.updated_at,
  }
}

function duplicateCounts(pages: AgentPage[]) {
  const counts = new Map<string, number>()
  for (const page of pages) {
    const name = normalizeMarketplaceName(page.name)
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

function queueItem(
  page: AgentPage,
  decision: MarketplaceCurationDecision,
  counts: Map<string, number>,
  now: Date,
  merchantOwnerId: string | null = null,
): MarketplaceCurationQueueItem {
  const duplicateNameCount = counts.get(normalizeMarketplaceName(page.name)) ?? 1
  return {
    page,
    merchantOwnerId,
    decision,
    duplicateNameCount,
    assessment: assessMarketplacePage(page, { duplicateNameCount, now }),
  }
}

const STATUS_ORDER: Record<MarketplaceCurationStatus, number> = {
  unreviewed: 0,
  candidate: 1,
  certified: 2,
  excluded: 3,
}

export async function getMarketplaceCurationQueue(): Promise<MarketplaceCurationQueue> {
  const generatedAt = new Date().toISOString()
  if (!hasSupabaseAdminEnv()) return emptyQueue(generatedAt)

  try {
    const admin = createAdminClient()
    const [
      { data: pageRows, error: pageError },
      { data: curationRows, error: curationError },
      { data: pageOwnerRows, error: pageOwnerError },
    ] = await Promise.all([
      admin
        .from('pages_public')
        .select(PUBLIC_PAGE_SELECT)
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(MAX_CURATED_PAGES)
        .returns<AgentPage[]>(),
      admin
        .from('marketplace_curations')
        .select('page_id, status, decision_reason, notes, reviewed_by, reviewed_at, certified_at, updated_at')
        .limit(MAX_CURATED_PAGES)
        .returns<CurationRow[]>(),
      admin
        .from('pages')
        .select('id, owner_id')
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(MAX_CURATED_PAGES)
        .returns<PageOwnerRow[]>(),
    ])
    if (pageError) throw pageError
    if (curationError) throw curationError
    if (pageOwnerError) throw pageOwnerError

    const pages = pageRows ?? []
    const decisions = new Map((curationRows ?? []).map((row) => [row.page_id, mapDecision(row)]))
    const ownerIds = new Map((pageOwnerRows ?? []).map((row) => [row.id, row.owner_id]))
    const counts = duplicateCounts(pages)
    const now = new Date(generatedAt)
    const items = pages
      .map((page) => queueItem(
        page,
        decisions.get(page.id) ?? defaultDecision(page.id),
        counts,
        now,
        ownerIds.get(page.id) ?? null,
      ))
      .sort((a, b) => {
        const statusDelta = STATUS_ORDER[a.decision.status] - STATUS_ORDER[b.decision.status]
        if (statusDelta !== 0) return statusDelta
        const blockerDelta = b.assessment.blockerCount - a.assessment.blockerCount
        if (blockerDelta !== 0) return blockerDelta
        return a.page.name.localeCompare(b.page.name)
      })

    return {
      generatedAt,
      available: true,
      items,
      summary: summarizeMarketplaceCuration(items),
    }
  } catch (error) {
    captureError(error instanceof Error ? error : new Error('Marketplace curation queue failed'), {
      scope: 'marketplace-curation:queue',
    })
    return emptyQueue(generatedAt)
  }
}

export async function updateMarketplaceCuration(input: {
  pageId: string
  status: MarketplaceCurationStatus
  decisionReason?: string | null
  notes?: string | null
  actorId: string
}): Promise<MarketplaceCurationQueueItem> {
  if (!hasSupabaseAdminEnv()) {
    throw new MarketplaceCurationError('Marketplace curation is not configured.', 'not_configured')
  }

  const decisionReason = input.decisionReason?.trim() || null
  const notes = input.notes?.trim() || null
  if (input.status === 'excluded' && !decisionReason) {
    throw new MarketplaceCurationError('Explain why this listing should leave discovery.', 'invalid_decision')
  }

  const admin = createAdminClient()
  const [{ data: page, error: pageError }, { data: names, error: namesError }] = await Promise.all([
    admin
      .from('pages_public')
      .select(PUBLIC_PAGE_SELECT)
      .eq('id', input.pageId)
      .eq('is_published', true)
      .maybeSingle<AgentPage>(),
    admin
      .from('pages')
      .select('id, owner_id, name')
      .eq('is_published', true)
      .limit(MAX_CURATED_PAGES)
      .returns<Array<Pick<AgentPage, 'id' | 'owner_id' | 'name'>>>(),
  ])
  if (pageError) throw new MarketplaceCurationError('The listing could not be loaded.', 'persistence_failed')
  if (namesError) throw new MarketplaceCurationError('Duplicate checks could not be completed.', 'persistence_failed')
  if (!page) throw new MarketplaceCurationError('Published listing not found.', 'not_found')

  const normalized = normalizeMarketplaceName(page.name)
  const duplicateNameCount = (names ?? []).filter((candidate) => normalizeMarketplaceName(candidate.name) === normalized).length || 1
  const assessedAt = new Date()
  const assessment = assessMarketplacePage(page, { duplicateNameCount, now: assessedAt })

  if (input.status === 'certified' && !canCertifyMarketplacePage(assessment)) {
    const blockers = assessment.flags
      .filter((flag) => flag.severity === 'blocker')
      .map((flag) => flag.label)
      .join(', ')
    throw new MarketplaceCurationError(
      blockers ? `Resolve certification blockers first: ${blockers}.` : 'This listing does not meet certification requirements.',
      'certification_blocked',
    )
  }

  const reviewedAt = assessedAt.toISOString()
  const { data: row, error: upsertError } = await admin
    .from('marketplace_curations')
    .upsert({
      page_id: input.pageId,
      status: input.status,
      decision_reason: decisionReason,
      notes,
      reviewed_by: input.actorId,
      reviewed_at: reviewedAt,
      certified_at: input.status === 'certified' ? reviewedAt : null,
      quality_snapshot: assessment,
    }, { onConflict: 'page_id' })
    .select('page_id, status, decision_reason, notes, reviewed_by, reviewed_at, certified_at, updated_at')
    .single<CurationRow>()

  if (upsertError || !row) {
    throw new MarketplaceCurationError('The curation decision could not be saved.', 'persistence_failed')
  }

  return {
    page,
    merchantOwnerId: names?.find((candidate) => candidate.id === page.id)?.owner_id ?? null,
    decision: mapDecision(row),
    assessment,
    duplicateNameCount,
  }
}
