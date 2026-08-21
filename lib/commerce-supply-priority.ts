import type { CommerceDemandSnapshot } from './commerce-demand'
import {
  commerceCurationCandidates,
  commerceReferenceCandidates,
  type CommerceCurationStatus,
} from './commerce-templates/curation'
import { listCommerceTemplates } from './commerce-templates/registry'
import type { CommerceDomain } from './commerce-templates/schema'

export type CommerceSupplyCatalog = {
  candidates: Array<{
    id: string
    title: string
    domain: CommerceDomain
    status: CommerceCurationStatus
  }>
  activeTemplateIds: ReadonlySet<string>
  canonicalCandidateIds: ReadonlySet<string>
}

export type CommerceSupplyLifecycle =
  | 'active-template'
  | 'curation-candidate'
  | 'reference-coverage'

export type CommerceSupplyAction =
  | 'recruit-exact-supply'
  | 'verify-related-supply'
  | 'validate-and-recruit'
  | 'resolve-category-overlap'
  | 'review-category-model'
  | 'monitor-certified-supply'

export type CommerceSupplyPriorityBasis = 'observed-demand' | 'launch-coverage'

export type CommerceSupplyPriority = {
  rank: number
  referenceId: string
  title: string
  domain: CommerceDomain
  lifecycle: CommerceSupplyLifecycle
  lifecycleLabel: string
  basis: CommerceSupplyPriorityBasis
  basisLabel: string
  action: CommerceSupplyAction
  actionLabel: string
  rationale: string
  observed: number
  live: number
  related: number
  reference: number
  unresolved: number
}

export const commerceSupplyCatalog: CommerceSupplyCatalog = {
  candidates: commerceReferenceCandidates,
  activeTemplateIds: new Set(
    listCommerceTemplates({ status: 'active' }).map((template) => template.id),
  ),
  canonicalCandidateIds: new Set(
    commerceCurationCandidates.map((candidate) => candidate.id),
  ),
}

/**
 * Turn directional demand into explainable operator actions. This deliberately
 * uses no opaque score: unresolved volume determines order, while catalog
 * lifecycle and observed outcome determine the recommended next move.
 */
export function buildCommerceSupplyPriorities(
  snapshot: CommerceDemandSnapshot,
  catalog: CommerceSupplyCatalog = commerceSupplyCatalog,
): CommerceSupplyPriority[] {
  if (!snapshot.available) return []

  const candidateById = new Map(
    catalog.candidates.map((candidate) => [candidate.id, candidate]),
  )

  return snapshot.categories
    .filter((category) => category.unresolved > 0)
    .flatMap((category) => {
      const candidate = candidateById.get(category.referenceId)
      if (!candidate || candidate.domain !== category.domain) return []

      const lifecycle: CommerceSupplyLifecycle = catalog.activeTemplateIds.has(candidate.id)
        ? 'active-template'
        : catalog.canonicalCandidateIds.has(candidate.id)
          ? 'curation-candidate'
          : 'reference-coverage'
      const recommendation = recommendAction(
        lifecycle,
        candidate.status,
        category.related,
        category.reference,
      )

      return [{
        rank: 0,
        referenceId: candidate.id,
        title: candidate.title,
        domain: candidate.domain,
        lifecycle,
        lifecycleLabel: lifecycleLabel(lifecycle),
        basis: 'observed-demand' as const,
        basisLabel: 'Observed demand',
        ...recommendation,
        observed: category.observed,
        live: category.live,
        related: category.related,
        reference: category.reference,
        unresolved: category.unresolved,
      }]
    })
    .sort(
      (a, b) => b.unresolved - a.unresolved
        || b.reference - a.reference
        || b.related - a.related
        || b.observed - a.observed
        || a.title.localeCompare(b.title),
    )
    .map((priority, index) => ({ ...priority, rank: index + 1 }))
}

/**
 * Build the explicit launch inventory plan from active Commerce templates.
 * These rows deliberately carry zero interaction counts: template activation
 * is a product coverage decision, not evidence that buyers requested it.
 */
export function buildCommerceLaunchCoveragePriorities(
  catalog: CommerceSupplyCatalog = commerceSupplyCatalog,
): CommerceSupplyPriority[] {
  return catalog.candidates
    .filter((candidate) => catalog.activeTemplateIds.has(candidate.id))
    .map((candidate) => ({
      rank: 0,
      referenceId: candidate.id,
      title: candidate.title,
      domain: candidate.domain,
      lifecycle: 'active-template' as const,
      lifecycleLabel: lifecycleLabel('active-template'),
      basis: 'launch-coverage' as const,
      basisLabel: 'Launch coverage',
      action: 'recruit-exact-supply' as const,
      actionLabel: 'Recruit exact supply',
      rationale: 'This active Commerce template is part of the launch inventory plan. Recruit exact certified supply to establish category coverage; this priority does not imply observed buyer demand.',
      observed: 0,
      live: 0,
      related: 0,
      reference: 0,
      unresolved: 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.referenceId.localeCompare(b.referenceId))
    .map((priority, index) => ({ ...priority, rank: index + 1 }))
}

function lifecycleLabel(lifecycle: CommerceSupplyLifecycle): string {
  if (lifecycle === 'active-template') return 'Active template'
  if (lifecycle === 'curation-candidate') return 'Curation candidate'
  return 'Reference coverage'
}

function recommendAction(
  lifecycle: CommerceSupplyLifecycle,
  status: CommerceCurationStatus,
  related: number,
  reference: number,
): Pick<CommerceSupplyPriority, 'action' | 'actionLabel' | 'rationale'> {
  if (lifecycle === 'curation-candidate' && status === 'overlap-review') {
    return {
      action: 'resolve-category-overlap',
      actionLabel: 'Resolve category overlap',
      rationale: 'Demand reached a category whose commerce mechanics overlap another candidate. Settle the canonical boundary before recruiting against it.',
    }
  }

  if (lifecycle === 'curation-candidate' && status === 'replacement-review') {
    return {
      action: 'review-category-model',
      actionLabel: 'Review category model',
      rationale: 'Demand reached a candidate already flagged for replacement review. Confirm that it teaches distinct commerce before recruiting supply.',
    }
  }

  if (lifecycle !== 'active-template') {
    return {
      action: 'validate-and-recruit',
      actionLabel: 'Validate category + recruit',
      rationale: 'Confirm the commerce model with real merchants before promoting the template or presenting provider fit.',
    }
  }

  if (reference > 0) {
    return {
      action: 'recruit-exact-supply',
      actionLabel: 'Recruit exact supply',
      rationale: related > 0
        ? 'Some requests reached only related supply and others required reference behavior; recruit an exact provider and review adjacent listings.'
        : 'Requests required non-purchasable reference behavior because no exact published provider was available.',
    }
  }

  return {
    action: 'verify-related-supply',
    actionLabel: 'Verify related supply',
    rationale: 'Related marketplace supply surfaced, but its published facts did not establish complete request coverage.',
  }
}
