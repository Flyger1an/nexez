import type { AgentPage } from './agent-page'

export type LocationMatch = {
  active: boolean
  query: string | null
  matched: boolean
  confidence: number
  mode: 'text' | 'broad' | 'none'
  matched_values: string[]
}

const STOPWORDS = new Set(['near', 'in', 'at', 'around', 'area', 'metro', 'city', 'county', 'state', 'the'])

const BROAD_LOCATION_TERMS = [
  'remote',
  'online',
  'virtual',
  'nationwide',
  'worldwide',
  'global',
  'anywhere',
  'united states',
  'usa',
  'us',
]

const LOCATION_ALIASES: Record<string, string[]> = {
  'new york': ['ny', 'nyc', 'new york city'],
  california: ['ca', 'cali'],
  texas: ['tx'],
  florida: ['fl'],
  illinois: ['il'],
  georgia: ['ga'],
  washington: ['wa'],
  arizona: ['az'],
  colorado: ['co'],
  massachusetts: ['ma'],
  pennsylvania: ['pa'],
  ohio: ['oh'],
  michigan: ['mi'],
  'north carolina': ['nc'],
  'south carolina': ['sc'],
  virginia: ['va'],
  maryland: ['md'],
  oregon: ['or'],
  nevada: ['nv'],
  tennessee: ['tn'],
  minnesota: ['mn'],
  wisconsin: ['wi'],
  indiana: ['in'],
  missouri: ['mo'],
  louisiana: ['la'],
  alabama: ['al'],
  kentucky: ['ky'],
  oklahoma: ['ok'],
  connecticut: ['ct'],
  utah: ['ut'],
  iowa: ['ia'],
  kansas: ['ks'],
  arkansas: ['ar'],
  nebraska: ['ne'],
  'new jersey': ['nj'],
  'new mexico': ['nm'],
  'new hampshire': ['nh'],
  vermont: ['vt'],
  maine: ['me'],
  alaska: ['ak'],
  hawaii: ['hi'],
  idaho: ['id'],
  montana: ['mt'],
  wyoming: ['wy'],
  'rhode island': ['ri'],
  delaware: ['de'],
  mississippi: ['ms'],
  'west virginia': ['wv'],
  'north dakota': ['nd'],
  'south dakota': ['sd'],
  'district of columbia': ['dc', 'washington dc', 'washington d c'],
}

export function cleanLocationQuery(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function normalizeLocationText(value: string | null | undefined) {
  let normalized = cleanLocationQuery(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  for (const [canonical, aliases] of Object.entries(LOCATION_ALIASES)) {
    for (const alias of aliases) {
      normalized = normalized.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'g'), `${alias} ${canonical}`)
    }
  }

  return normalized.replace(/\s+/g, ' ').trim()
}

export function locationTokens(value: string | null | undefined) {
  return [...new Set(normalizeLocationText(value).split(' ').filter((token) => token.length > 1 && !STOPWORDS.has(token)))]
}

export function pageLocationValues(page: Pick<AgentPage, 'location' | 'services' | 'products'>): string[] {
  const values = [
    page.location,
    ...(page.services ?? []).flatMap((offer) => [
      offer.serviceArea,
      offer.metadata?.service_area,
      offer.metadata?.serviceArea,
      offer.metadata?.location,
      offer.metadata?.locations,
    ]),
    ...(page.products ?? []).flatMap((offer) => [
      offer.serviceArea,
      offer.metadata?.service_area,
      offer.metadata?.serviceArea,
      offer.metadata?.location,
      offer.metadata?.locations,
    ]),
  ]

  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

export function getPageLocationMatch(page: Pick<AgentPage, 'location' | 'services' | 'products'>, locationQuery: string | null | undefined): LocationMatch {
  const query = cleanLocationQuery(locationQuery)
  if (!query) {
    return { active: false, query: null, matched: true, confidence: 1, mode: 'none', matched_values: [] }
  }

  const queryNormalized = normalizeLocationText(query)
  const queryTerms = locationTokens(query)
  const values = pageLocationValues(page)

  let best: LocationMatch = {
    active: true,
    query,
    matched: false,
    confidence: 0,
    mode: 'none',
    matched_values: [],
  }

  for (const value of values) {
    const normalized = normalizeLocationText(value)
    if (!normalized) continue

    const isBroad = BROAD_LOCATION_TERMS.some((term) => normalized.includes(term))
    if (isBroad && best.confidence < 0.35) {
      best = { active: true, query, matched: true, confidence: 0.35, mode: 'broad', matched_values: [value] }
    }

    const direct = normalized.includes(queryNormalized) || queryNormalized.includes(normalized)
    const valueTerms = new Set(locationTokens(value))
    const matchedTerms = queryTerms.filter((term) => valueTerms.has(term) || normalized.includes(term))
    const confidence = queryTerms.length ? matchedTerms.length / queryTerms.length : 0

    if (direct || confidence >= 0.5) {
      const nextConfidence = direct ? Math.max(0.9, confidence) : confidence
      if (nextConfidence > best.confidence) {
        best = {
          active: true,
          query,
          matched: true,
          confidence: Math.min(1, Number(nextConfidence.toFixed(2))),
          mode: 'text',
          matched_values: [value],
        }
      }
    }
  }

  return best
}

export function filterPagesByLocation<T extends Pick<AgentPage, 'location' | 'services' | 'products'>>(pages: T[], locationQuery: string | null | undefined): T[] {
  const query = cleanLocationQuery(locationQuery)
  if (!query) return pages
  return pages.filter((page) => getPageLocationMatch(page, query).matched)
}

export function locationFilterMeta(locationQuery: string | null | undefined, coords?: { lat?: number | null; lng?: number | null }) {
  const query = cleanLocationQuery(locationQuery)
  return {
    active: Boolean(query),
    query: query || null,
    lat: typeof coords?.lat === 'number' && Number.isFinite(coords.lat) ? coords.lat : null,
    lng: typeof coords?.lng === 'number' && Number.isFinite(coords.lng) ? coords.lng : null,
    matching: 'Text match against page location and offer service areas. Remote/nationwide offers remain eligible.',
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
