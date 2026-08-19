import {
  formatOfferLines,
  parseOfferLines,
  splitLines,
  type OfferItem,
} from './agent-page'
import {
  OFFER_ATTRIBUTES_MARKER,
  OFFER_INPUTS_MARKER,
  OFFER_RECURRING_MARKER,
  formatOfferAttributesMarker,
  formatOfferInputsMarker,
  formatOfferRecurringMarker,
  parseOfferAttributesMarker,
  parseOfferInputsMarker,
  parseOfferRecurringMarker,
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
import {
  validateRecurringServiceTerms,
  validateRecurringServiceTermsForInputs,
  type RecurringServiceTerms,
} from './recurring-service'

/**
 * Backward-compatible bridge between today's OfferItem and richer merchant-authored
 * commerce primitives. The adapter proves persistence/provenance before fields are
 * promoted into every legacy offer contract.
 */
export type ConfiguredOfferItem = OfferItem & {
  customerInputs?: OfferInputField[]
  attributes?: OfferAttribute[]
  /** Public merchant-authored recurring-service contract. Never buyer/model authored. */
  recurringTerms?: RecurringServiceTerms
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

export function getOfferRecurringTerms(offer: OfferItem): RecurringServiceTerms | null {
  const validated = validateRecurringServiceTerms(configured(offer).recurringTerms)
  if (!validated.ok) return null
  const linked = validateRecurringServiceTermsForInputs(validated.value, getOfferCustomerInputs(offer))
  return linked.ok ? linked.value : null
}

export function withOfferCustomerInput(
  offer: OfferItem,
  value: unknown,
): OfferConfigurationValidation<ConfiguredOfferItem> {
  const result = upsertOfferInputField(getOfferCustomerInputs(offer), value)
  if (!result.ok) return result
  const next = { ...configured(offer), customerInputs: result.value }
  const recurring = configured(offer).recurringTerms
  if (recurring) {
    const validated = validateRecurringServiceTermsForInputs(recurring, result.value)
    if (!validated.ok) return { ok: false, error: validated.error }
  }
  return { ok: true, value: next }
}

export function withOfferAttribute(
  offer: OfferItem,
  value: unknown,
): OfferConfigurationValidation<ConfiguredOfferItem> {
  const result = upsertOfferAttribute(getOfferAttributes(offer), value)
  if (!result.ok) return result
  return { ok: true, value: { ...configured(offer), attributes: result.value } }
}

export function withOfferRecurringTerms(
  offer: OfferItem,
  value: unknown,
): OfferConfigurationValidation<ConfiguredOfferItem> {
  const validated = validateRecurringServiceTerms(value)
  if (!validated.ok) return { ok: false, error: validated.error }
  const linked = validateRecurringServiceTermsForInputs(validated.value, getOfferCustomerInputs(offer))
  if (!linked.ok) return { ok: false, error: linked.error }
  return { ok: true, value: { ...configured(offer), recurringTerms: linked.value } }
}

/**
 * `propose_offers` is an LLM curation surface, not merchant truth. Explicitly
 * discard all rich merchant-authored contract fields supplied by a proposal and
 * preserve only the validated authoritative values already on the offer.
 */
export function mergeProposedOfferPreservingConfiguration(
  existing: OfferItem | undefined,
  proposed: OfferItem,
): ConfiguredOfferItem {
  const proposal = { ...(proposed as OfferItem & Record<string, unknown>) }
  delete proposal.customerInputs
  delete proposal.attributes
  delete proposal.recurringTerms

  const customerInputs = existing ? getOfferCustomerInputs(existing) : []
  const attributes = existing ? getOfferAttributes(existing) : []
  const recurringTerms = existing ? getOfferRecurringTerms(existing) : null

  return {
    ...(existing ?? {}),
    ...(proposal as OfferItem),
    ...(customerInputs.length ? { customerInputs } : {}),
    ...(attributes.length ? { attributes } : {}),
    ...(recurringTerms ? { recurringTerms } : {}),
  } as ConfiguredOfferItem
}

function normalizeOfferIdentity(name: string | undefined | null): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

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

function extractConfigurationMarker(line: string, marker: string): string | undefined {
  const match = line.match(new RegExp(`${escapeRegExp(marker)}[^|]*`))
  return match?.[0].trim()
}

function stripConfigurationMarker(line: string, marker: string): string {
  return line.replace(new RegExp(`\\s*\\|\\s*${escapeRegExp(marker)}[^|]*`), '')
}

function stripConfigurationMarkers(line: string): string {
  return stripConfigurationMarker(
    stripConfigurationMarker(
      stripConfigurationMarker(line, OFFER_INPUTS_MARKER),
      OFFER_ATTRIBUTES_MARKER,
    ),
    OFFER_RECURRING_MARKER,
  ).trim()
}

const LEGACY_TIERS_MARKER = '||TIERS||'

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
        (tier) => tier && typeof tier === 'object' && typeof tier.name === 'string' && typeof tier.price === 'string' &&
          (tier.description == null || typeof tier.description === 'string'),
      )
      if (valid) return parsed
    } catch {
      // Keep scanning until a complete tier array parses.
    }
  }
  return undefined
}

export function parseConfiguredOfferLines(value: string): ConfiguredOfferItem[] {
  return splitLines(value).map((line) => {
    const inputsPart = extractConfigurationMarker(line, OFFER_INPUTS_MARKER)
    const attributesPart = extractConfigurationMarker(line, OFFER_ATTRIBUTES_MARKER)
    const recurringPart = extractConfigurationMarker(line, OFFER_RECURRING_MARKER)
    const baseLine = stripConfigurationMarkers(line)
    const base = parseOfferLines(baseLine)[0]

    const customerInputs = parseOfferInputsMarker(inputsPart)
    const attributes = parseOfferAttributesMarker(attributesPart)
    const rawRecurring = parseOfferRecurringMarker(recurringPart)
    const recurringTerms = rawRecurring && validateRecurringServiceTermsForInputs(rawRecurring, customerInputs ?? []).ok
      ? rawRecurring
      : undefined
    const tiers = base.tiers?.length ? base.tiers : recoverLegacyTiers(baseLine)

    return {
      ...base,
      ...(tiers?.length ? { tiers } : {}),
      ...(customerInputs?.length ? { customerInputs } : {}),
      ...(attributes?.length ? { attributes } : {}),
      ...(recurringTerms ? { recurringTerms } : {}),
    }
  })
}

export function formatConfiguredOfferLines(items: ConfiguredOfferItem[] | null | undefined): string {
  return (items ?? [])
    .map((offer) => {
      const base = formatOfferLines([offer])
      const inputs = formatOfferInputsMarker(offer.customerInputs)
      const attributes = formatOfferAttributesMarker(offer.attributes)
      const recurring = formatOfferRecurringMarker(offer.recurringTerms)
      return [base, inputs, attributes, recurring].filter(Boolean).join(' | ')
    })
    .join('\n')
}
