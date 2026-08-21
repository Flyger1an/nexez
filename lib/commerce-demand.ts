import type { SimIntent } from './agent-simulator'
import type { CommerceCurationCandidate } from './commerce-templates/curation'
import type { CommerceDomain } from './commerce-templates/schema'
import type { PublicSimulatorMode } from './public-simulator'

export type CommerceDemandSignalInput = {
  mode: PublicSimulatorMode
  intent: SimIntent
  reference: Pick<CommerceCurationCandidate, 'id' | 'domain'> | null
}

export type CommerceDemandSignalRow = {
  id: string
  created_at: string
  surface: 'homepage_simulator'
  mode: PublicSimulatorMode
  intent: SimIntent
  reference_id: string | null
  reference_domain: CommerceDomain | null
}

export type CommerceDemandCategory = {
  referenceId: string
  title: string
  domain: CommerceDomain
  observed: number
  live: number
  related: number
  reference: number
  unresolved: number
}

export type CommerceDemandSnapshot = {
  generatedAt: string
  since: string
  available: boolean
  truncated: boolean
  totalSignals: number
  mappedSignals: number
  liveMatches: number
  relatedMatches: number
  referenceMatches: number
  coverageGaps: number
  categories: CommerceDemandCategory[]
}

const MODES = new Set<PublicSimulatorMode>([
  'marketplace',
  'partial_match',
  'simulation',
  'coverage_gap',
])
const INTENTS = new Set<SimIntent>([
  'booking',
  'pricing',
  'fit',
  'product',
  'contact',
  'overview',
])
const DOMAINS = new Set<CommerceDomain>([
  'home-property',
  'automotive-mobile',
  'events-hospitality',
  'beauty-fitness-personal',
  'professional-creative-technical',
  'education-family-pet',
  'local-commercial-operations',
])
const REFERENCE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

/**
 * Builds the complete persistence allowlist. The input type deliberately has
 * no place for buyer text, merchant identity, location, session, IP, or user
 * agent data, and this builder never spreads caller-owned objects into a row.
 */
export function buildCommerceDemandSignalRow(
  input: CommerceDemandSignalInput,
): Omit<CommerceDemandSignalRow, 'id' | 'created_at'> | null {
  if (!MODES.has(input.mode) || !INTENTS.has(input.intent)) return null

  const reference = input.mode === 'coverage_gap'
    ? null
    : validReference(input.reference)
  if (input.mode === 'simulation' && !reference) return null

  return {
    surface: 'homepage_simulator',
    mode: input.mode,
    intent: input.intent,
    reference_id: reference?.id ?? null,
    reference_domain: reference?.domain ?? null,
  }
}

function validReference(
  reference: CommerceDemandSignalInput['reference'],
): CommerceDemandSignalInput['reference'] {
  if (!reference) return null
  if (!REFERENCE_ID.test(reference.id) || reference.id.length > 120) return null
  if (!DOMAINS.has(reference.domain)) return null
  return { id: reference.id, domain: reference.domain }
}

export function emptyCommerceDemandSnapshot(
  generatedAt = new Date().toISOString(),
  since = new Date(Date.parse(generatedAt) - 30 * 24 * 60 * 60_000).toISOString(),
): CommerceDemandSnapshot {
  return {
    generatedAt,
    since,
    available: false,
    truncated: false,
    totalSignals: 0,
    mappedSignals: 0,
    liveMatches: 0,
    relatedMatches: 0,
    referenceMatches: 0,
    coverageGaps: 0,
    categories: [],
  }
}

export function summarizeCommerceDemandSignals(
  rows: CommerceDemandSignalRow[],
  candidates: Array<Pick<CommerceCurationCandidate, 'id' | 'title' | 'domain'>>,
  generatedAt: string,
  since: string,
  truncated = false,
): CommerceDemandSnapshot {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const categoryById = new Map<string, CommerceDemandCategory>()

  for (const row of rows) {
    if (!row.reference_id) continue
    const candidate = candidateById.get(row.reference_id)
    if (!candidate || candidate.domain !== row.reference_domain) continue
    const category = categoryById.get(candidate.id) ?? {
      referenceId: candidate.id,
      title: candidate.title,
      domain: candidate.domain,
      observed: 0,
      live: 0,
      related: 0,
      reference: 0,
      unresolved: 0,
    }
    category.observed += 1
    if (row.mode === 'marketplace') category.live += 1
    if (row.mode === 'partial_match') category.related += 1
    if (row.mode === 'simulation') category.reference += 1
    category.unresolved = category.related + category.reference
    categoryById.set(candidate.id, category)
  }

  const categories = [...categoryById.values()].sort(
    (a, b) => b.unresolved - a.unresolved || b.observed - a.observed || a.title.localeCompare(b.title),
  )

  return {
    generatedAt,
    since,
    available: true,
    truncated,
    totalSignals: rows.length,
    mappedSignals: categories.reduce((total, category) => total + category.observed, 0),
    liveMatches: rows.filter((row) => row.mode === 'marketplace').length,
    relatedMatches: rows.filter((row) => row.mode === 'partial_match').length,
    referenceMatches: rows.filter((row) => row.mode === 'simulation').length,
    coverageGaps: rows.filter((row) => row.mode === 'coverage_gap').length,
    categories,
  }
}
