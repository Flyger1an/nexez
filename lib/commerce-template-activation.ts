import type { CommerceSupplyWorkflowSnapshot } from './commerce-supply-workflow'
import type { MarketplaceCurationQueue, MarketplaceCurationStatus } from './marketplace-curation'
import type { CommerceTemplate } from './commerce-templates/schema'

export type CommerceTemplateActivationListing = {
  id: string
  name: string
  slug: string
  isPublished: boolean
  readiness: number
  templateId: string | null
  templateVersion: number | null
  adoptedAt: string | null
  source: 'owner_selected_intake' | null
}

export type CommerceTemplateActivationStatus =
  | 'needs-publishing'
  | 'needs-marketplace-review'
  | 'published'
  | 'discovery-excluded'
  | 'exact-certified-supply'

export type CommerceTemplateActivationRow = CommerceTemplateActivationListing & {
  status: CommerceTemplateActivationStatus
  marketplaceStatus: MarketplaceCurationStatus | null
  nextAction: string
}

export type CommerceTemplateOutsideSupplyRelationship =
  | 'no-recorded-guide'
  | 'different-version'
  | 'different-guide'

export type CommerceTemplateOutsideSupply = {
  pageId: string
  pageName: string
  pageSlug: string
  offerName: string
  relationship: CommerceTemplateOutsideSupplyRelationship
}

export type CommerceTemplateActivationGroup = {
  templateId: string
  templateVersion: number
  title: string
  listings: CommerceTemplateActivationRow[]
  certifiedOutsideVersion: CommerceTemplateOutsideSupply[] | null
  summary: {
    listings: number
    needsPublishing: number
    published: number
    marketplaceReview: number | null
    certifiedOnVersion: number | null
  }
}

export type CommerceTemplateActivationReport = {
  available: boolean
  sources: {
    listings: { available: boolean; truncated: boolean }
    marketplace: boolean
    supply: boolean
  }
  summary: {
    activeGuides: number
    listings: number | null
    needsPublishing: number | null
    published: number | null
    certifiedOnGuide: number | null
    certifiedOutsideGuide: number | null
    outsideActiveGuides: number | null
  }
  groups: CommerceTemplateActivationGroup[]
}

type BuildCommerceTemplateActivationReportInput = {
  templates: CommerceTemplate[]
  listings: CommerceTemplateActivationListing[]
  listingsAvailable: boolean
  listingsTruncated: boolean
  marketplace: MarketplaceCurationQueue
  supply: CommerceSupplyWorkflowSnapshot
}

const STATUS_ORDER: Record<CommerceTemplateActivationStatus, number> = {
  'needs-publishing': 0,
  'needs-marketplace-review': 1,
  published: 2,
  'discovery-excluded': 3,
  'exact-certified-supply': 4,
}

function versionedKey(templateId: string, templateVersion: number): string {
  return `${templateId}@${templateVersion}`
}

function validLineage(listing: CommerceTemplateActivationListing) {
  if (
    listing.source !== 'owner_selected_intake'
    || !listing.templateId
    || !Number.isInteger(listing.templateVersion)
    || (listing.templateVersion ?? 0) < 1
  ) return null

  return {
    templateId: listing.templateId,
    templateVersion: listing.templateVersion as number,
  }
}

function activationStatus(input: {
  listing: CommerceTemplateActivationListing
  marketplaceAvailable: boolean
  marketplaceStatus: MarketplaceCurationStatus | null
  exactCertified: boolean
}): Pick<CommerceTemplateActivationRow, 'status' | 'nextAction'> {
  if (!input.listing.isPublished) {
    return { status: 'needs-publishing', nextAction: 'Seller needs to finish and publish this listing' }
  }
  if (input.exactCertified) {
    return { status: 'exact-certified-supply', nextAction: 'Keep the listing current and monitor results' }
  }
  if (!input.marketplaceAvailable) {
    return { status: 'published', nextAction: 'Refresh marketplace evidence before acting' }
  }
  if (input.marketplaceStatus === 'excluded') {
    return { status: 'discovery-excluded', nextAction: 'Review the discovery decision in Launch Control' }
  }
  if (input.marketplaceStatus === 'unreviewed' || input.marketplaceStatus === 'candidate') {
    return { status: 'needs-marketplace-review', nextAction: 'Review this listing in Launch Control' }
  }
  return { status: 'published', nextAction: 'Confirm that a published offer matches this category' }
}

function compareListings(left: CommerceTemplateActivationRow, right: CommerceTemplateActivationRow): number {
  return STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    || left.readiness - right.readiness
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id)
}

function compareGroups(left: CommerceTemplateActivationGroup, right: CommerceTemplateActivationGroup): number {
  const leftActionable = left.summary.needsPublishing + (left.summary.marketplaceReview ?? 0)
  const rightActionable = right.summary.needsPublishing + (right.summary.marketplaceReview ?? 0)
  return rightActionable - leftActionable
    || right.summary.listings - left.summary.listings
    || left.title.localeCompare(right.title)
    || left.templateId.localeCompare(right.templateId)
}

/**
 * Joins private owner-selected template lineage with public marketplace review
 * and exact certified category supply. Each fact keeps its own authority. The
 * report never changes merchant state and never treats template adoption as
 * proof that a listing supplies the category.
 */
export function buildCommerceTemplateActivationReport({
  templates,
  listings,
  listingsAvailable,
  listingsTruncated,
  marketplace,
  supply,
}: BuildCommerceTemplateActivationReportInput): CommerceTemplateActivationReport {
  const activeTemplates = templates.filter((template) => template.status === 'active')
  const activeKeys = new Set(activeTemplates.map((template) => versionedKey(template.id, template.version)))
  const validListings = listings
    .map((listing) => ({ listing, lineage: validLineage(listing) }))
    .filter((entry): entry is { listing: CommerceTemplateActivationListing; lineage: { templateId: string; templateVersion: number } } => Boolean(entry.lineage))
  const lineageByPage = new Map(validListings.map((entry) => [entry.listing.id, entry.lineage]))
  const marketplaceStatusByPage = new Map(
    marketplace.items.map((item) => [item.page.id, item.decision.status]),
  )
  const supplyByTemplate = new Map(supply.items.map((item) => [item.referenceId, item.certifiedSupply]))

  const groups = activeTemplates.map((template) => {
    const exactListings = listingsAvailable
      ? validListings
        .filter((entry) => (
          entry.lineage.templateId === template.id
          && entry.lineage.templateVersion === template.version
        ))
        .map((entry) => entry.listing)
      : []
    const exactCertifiedSupply = supply.verificationAvailable
      ? supplyByTemplate.get(template.id) ?? []
      : null
    const exactCertifiedPageIds = new Set(exactCertifiedSupply?.map((item) => item.pageId) ?? [])
    const rows = exactListings.map((listing) => {
      const marketplaceStatus = marketplace.available
        ? marketplaceStatusByPage.get(listing.id) ?? null
        : null
      const state = activationStatus({
        listing,
        marketplaceAvailable: marketplace.available,
        marketplaceStatus,
        exactCertified: supply.verificationAvailable && exactCertifiedPageIds.has(listing.id),
      })
      return { ...listing, marketplaceStatus, ...state }
    }).sort(compareListings)
    const certifiedOutsideVersion = listingsAvailable && exactCertifiedSupply
      ? [...new Map(exactCertifiedSupply
        .filter((item) => !rows.some((listing) => listing.id === item.pageId))
        .map((item) => {
          const lineage = lineageByPage.get(item.pageId)
          const relationship: CommerceTemplateOutsideSupplyRelationship = !lineage
            ? 'no-recorded-guide'
            : lineage.templateId === template.id
              ? 'different-version'
              : 'different-guide'
          return [item.pageId, { ...item, relationship }]
        })).values()].sort((left, right) => (
        left.pageName.localeCompare(right.pageName) || left.pageId.localeCompare(right.pageId)
      ))
      : null

    return {
      templateId: template.id,
      templateVersion: template.version,
      title: template.title,
      listings: rows,
      certifiedOutsideVersion,
      summary: {
        listings: rows.length,
        needsPublishing: rows.filter((listing) => listing.status === 'needs-publishing').length,
        published: rows.filter((listing) => listing.isPublished).length,
        marketplaceReview: marketplace.available
          ? rows.filter((listing) => listing.status === 'needs-marketplace-review').length
          : null,
        certifiedOnVersion: supply.verificationAvailable
          ? rows.filter((listing) => listing.status === 'exact-certified-supply').length
          : null,
      },
    } satisfies CommerceTemplateActivationGroup
  }).sort(compareGroups)

  const includedListings = groups.flatMap((group) => group.listings)
  const outsideActiveGuides = listingsAvailable
    ? validListings.filter((entry) => !activeKeys.has(versionedKey(entry.lineage.templateId, entry.lineage.templateVersion))).length
    : null
  const certifiedOutsideGuide = listingsAvailable && supply.verificationAvailable
    ? new Set(groups.flatMap((group) => group.certifiedOutsideVersion ?? []).map((listing) => listing.pageId)).size
    : null

  return {
    available: listingsAvailable,
    sources: {
      listings: { available: listingsAvailable, truncated: listingsTruncated },
      marketplace: marketplace.available,
      supply: supply.verificationAvailable,
    },
    summary: {
      activeGuides: groups.length,
      listings: listingsAvailable ? includedListings.length : null,
      needsPublishing: listingsAvailable
        ? includedListings.filter((listing) => listing.status === 'needs-publishing').length
        : null,
      published: listingsAvailable
        ? includedListings.filter((listing) => listing.isPublished).length
        : null,
      certifiedOnGuide: listingsAvailable && supply.verificationAvailable
        ? includedListings.filter((listing) => listing.status === 'exact-certified-supply').length
        : null,
      certifiedOutsideGuide,
      outsideActiveGuides,
    },
    groups,
  }
}
