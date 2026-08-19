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

function isConfigurationMarker(part: string): boolean {
  return part.includes(OFFER_INPUTS_MARKER) || part.includes(OFFER_ATTRIBUTES_MARKER)
}

/**
 * Legacy text editor compatibility.
 *
 * Configuration markers are removed BEFORE delegating to parseOfferLines().
 * Without this guard an old parser would mistake a trailing [[INPUTS]] marker
 * for the first consumer field (`duration`) when no other consumer fields exist.
 */
export function parseConfiguredOfferLines(value: string): ConfiguredOfferItem[] {
  return splitLines(value).map((line) => {
    const parts = line.split('|').map((part) => part.trim())
    const inputsPart = parts.find((part) => part.includes(OFFER_INPUTS_MARKER))
    const attributesPart = parts.find((part) => part.includes(OFFER_ATTRIBUTES_MARKER))
    const baseLine = parts.filter((part) => !isConfigurationMarker(part)).join(' | ')
    const base = parseOfferLines(baseLine)[0]

    const customerInputs = parseOfferInputsMarker(inputsPart)
    const attributes = parseOfferAttributesMarker(attributesPart)

    return {
      ...base,
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
