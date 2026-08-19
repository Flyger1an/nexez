import {
  formatOfferLines,
  parseOfferLines,
  splitLines,
  type OfferItem,
} from './agent-page'
import {
  OFFER_ATTRIBUTES_MARKER,
  OFFER_INPUTS_MARKER,
  formatOfferAttributesMarker,
  formatOfferInputsMarker,
  parseOfferAttributesMarker,
  parseOfferInputsMarker,
} from './offer-configuration-codec'
import {
  sanitizeOfferAttributes,
  sanitizeOfferInputFields,
  upsertOfferAttribute,
  upsertOfferInputField,
  type OfferAttribute,
  type OfferConfigurationValidation,
  type OfferInputField,
} from './offer-configuration'

/**
 * Backward-compatible bridge between today's OfferItem and the richer Commerce
 * Schema primitives. Keeping this as an adapter first lets us prove persistence,
 * provenance, and editor behavior before promoting the fields into every public
 * agent/checkout contract.
 */
export type ConfiguredOfferItem = OfferItem & {
  /** Merchant-authored public schema describing information a buyer must/may supply. */
  customerInputs?: OfferInputField[]
  /** Public-safe merchant facts/capabilities used for matching and configuration. */
  attributes?: OfferAttribute[]
}

function configured(offer: OfferItem): ConfiguredOfferItem {
  return offer as ConfiguredOfferItem
}

export function getOfferCustomerInputs(offer: OfferItem): OfferInputField[] {
  return sanitizeOfferInputFields(configured(offer).customerInputs)
}

export function getOfferAttributes(offer: OfferItem): OfferAttribute[] {
  return sanitizeOfferAttributes(configured(offer).attributes)
}

export function withOfferCustomerInput(
  offer: OfferItem,
  value: unknown,
): OfferConfigurationValidation<ConfiguredOfferItem> {
  const result = upsertOfferInputField(getOfferCustomerInputs(offer), value)
  if (!result.ok) return result
  return { ok: true, value: { ...offer, customerInputs: result.value } }
}

export function withOfferAttribute(
  offer: OfferItem,
  value: unknown,
): OfferConfigurationValidation<ConfiguredOfferItem> {
  const result = upsertOfferAttribute(getOfferAttributes(offer), value)
  if (!result.ok) return result
  return { ok: true, value: { ...offer, attributes: result.value } }
}

/**
 * `propose_offers` is an LLM curation surface, not a merchant-truth surface.
 * Runtime tool payloads can contain unknown extra keys even when TypeScript says
 * `OfferItem`, so explicitly discard configuration supplied by the proposal and
 * preserve only the validated merchant/imported configuration already attached
 * to the authoritative offer.
 */
export function mergeProposedOfferPreservingConfiguration(
  existing: OfferItem | undefined,
  proposed: OfferItem,
): ConfiguredOfferItem {
  const proposal = { ...(proposed as OfferItem & Record<string, unknown>) }
  delete proposal.customerInputs
  delete proposal.attributes

  const customerInputs = existing ? getOfferCustomerInputs(existing) : []
  const attributes = existing ? getOfferAttributes(existing) : []

  return {
    ...(existing ?? {}),
    ...(proposal as OfferItem),
    ...(customerInputs.length ? { customerInputs } : {}),
    ...(attributes.length ? { attributes } : {}),
  } as ConfiguredOfferItem
}

function normalizeOfferIdentity(name: string | undefined | null): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Merge a whole rewritten offer collection back onto the authoritative rich
 * collection. This is used by editor transformations that still operate on the
 * legacy text representation: scalar/copy rewrites may win, but merchant-authored
 * configuration cannot disappear merely because text was reparsed.
 *
 * Offers omitted by a transformation are retained. A copy optimizer is never an
 * authorization surface for deleting merchant inventory.
 */
export function mergeOfferCollectionPreservingConfiguration(
  existing: OfferItem[] | null | undefined,
  proposed: OfferItem[] | null | undefined,
): ConfiguredOfferItem[] {
  const current = existing ?? []
  const incoming = proposed ?? []
  const existingByName = new Map(
    current
      .map((offer) => [normalizeOfferIdentity(offer.name), offer] as const)
      .filter(([key]) => Boolean(key)),
  )

  const merged = incoming.map((offer) =>
    mergeProposedOfferPreservingConfiguration(
      existingByName.get(normalizeOfferIdentity(offer.name)),
      offer,
    ),
  )

  const incomingNames = new Set(incoming.map((offer) => normalizeOfferIdentity(offer.name)).filter(Boolean))
  for (const offer of current) {
    const key = normalizeOfferIdentity(offer.name)
    if (key && incomingNames.has(key)) continue
    merged.push({ ...offer } as ConfiguredOfferItem)
  }

  return merged
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Configuration JSON is URI-encoded by offer-configuration-codec, so its
 * payload never contains a literal `|`. That lets us extract/remove only our
 * markers without tokenizing the whole legacy line. Tokenizing on a single
 * pipe would corrupt pre-existing double-pipe markers such as `||TIERS||`.
 */
function extractConfigurationMarker(line: string, marker: string): string | undefined {
  const match = line.match(new RegExp(`${escapeRegExp(marker)}[^|]*`))
  return match?.[0].trim()
}

function stripConfigurationMarker(line: string, marker: string): string {
  return line.replace(
    new RegExp(`\\s*\\|\\s*${escapeRegExp(marker)}[^|]*`),
    '',
  )
}

function stripConfigurationMarkers(line: string): string {
  return stripConfigurationMarker(
    stripConfigurationMarker(line, OFFER_INPUTS_MARKER),
    OFFER_ATTRIBUTES_MARKER,
  ).trim()
}

const LEGACY_TIERS_MARKER = '||TIERS||'

/**
 * `formatOfferLines()` historically emits tiers as `||TIERS||<json>`, while
 * `parseOfferLines()` tokenizes on single pipes before looking for that marker.
 * The repository's legacy tests explicitly document that complex tier parsing
 * as a pre-existing fidelity edge. The Commerce adapter repairs that edge
 * locally without changing the platform-wide legacy parser.
 *
 * We scan closing-array positions until JSON.parse succeeds rather than slicing
 * on a following pipe. That keeps tier descriptions containing `|` or `]` safe.
 */
function recoverLegacyTiers(line: string): NonNullable<OfferItem['tiers']> | undefined {
  const markerIndex = line.indexOf(LEGACY_TIERS_MARKER)
  if (markerIndex === -1) return undefined

  const tail = line.slice(markerIndex + LEGACY_TIERS_MARKER.length)
  for (let index = tail.indexOf(']'); index !== -1; index = tail.indexOf(']', index + 1)) {
    const candidate = tail.slice(0, index + 1).trim()
    try {
      const parsed = JSON.parse(candidate)
      if (!Array.isArray(parsed)) continue
      const valid = parsed.every(
        (tier) =>
          tier &&
          typeof tier === 'object' &&
          typeof tier.name === 'string' &&
          typeof tier.price === 'string' &&
          (tier.description == null || typeof tier.description === 'string'),
      )
      if (valid) return parsed
    } catch {
      // A `]` inside a JSON string or nested value is not the array terminator.
      // Keep scanning until a complete tier array parses.
    }
  }

  return undefined
}

/**
 * Legacy text editor compatibility.
 *
 * Configuration markers are removed BEFORE delegating to parseOfferLines().
 * Without this guard an old parser would mistake a trailing [[INPUTS]] marker
 * for the first consumer field (`duration`) when no other consumer fields exist.
 * Crucially, we never split/rejoin the base line: old markers such as
 * `||TIERS||` and `||RULES||` remain byte-for-byte intact for the legacy parser.
 */
export function parseConfiguredOfferLines(value: string): ConfiguredOfferItem[] {
  return splitLines(value).map((line) => {
    const inputsPart = extractConfigurationMarker(line, OFFER_INPUTS_MARKER)
    const attributesPart = extractConfigurationMarker(line, OFFER_ATTRIBUTES_MARKER)
    const baseLine = stripConfigurationMarkers(line)
    const base = parseOfferLines(baseLine)[0]

    const customerInputs = parseOfferInputsMarker(inputsPart)
    const attributes = parseOfferAttributesMarker(attributesPart)
    const tiers = base.tiers?.length ? base.tiers : recoverLegacyTiers(baseLine)

    return {
      ...base,
      ...(tiers?.length ? { tiers } : {}),
      ...(customerInputs?.length ? { customerInputs } : {}),
      ...(attributes?.length ? { attributes } : {}),
    }
  })
}

export function formatConfiguredOfferLines(items: ConfiguredOfferItem[] | null | undefined): string {
  return (items ?? [])
    .map((offer) => {
      const base = formatOfferLines([offer])
      const inputs = formatOfferInputsMarker(offer.customerInputs)
      const attributes = formatOfferAttributesMarker(offer.attributes)
      return [base, inputs, attributes].filter(Boolean).join(' | ')
    })
    .join('\n')
}
