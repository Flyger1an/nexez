import {
  sanitizeOfferAttributes,
  sanitizeOfferInputFields,
  type OfferAttribute,
  type OfferInputField,
} from './offer-configuration'
import { validateRecurringServiceTerms, type RecurringServiceTerms } from './recurring-service'
import {
  validateOfferFulfillmentRules,
  type OfferFulfillmentRule,
} from './conditional-fulfillment'
import { validateStagedSettlementTerms, type StagedSettlementTerms } from './staged-settlement'
import {
  validateReservableResourceTerms,
  type ReservableResourceTerms,
} from './reservable-resource'

/** Pipe-safe markers used by the legacy offer-line editor/import codec. */
export const OFFER_INPUTS_MARKER = '[[INPUTS]]'
export const OFFER_ATTRIBUTES_MARKER = '[[ATTRIBUTES]]'
export const OFFER_RECURRING_MARKER = '[[RECURRING]]'
export const OFFER_FULFILLMENT_MARKER = '[[FULFILLMENT]]'
export const OFFER_STAGED_SETTLEMENT_MARKER = '[[STAGED_SETTLEMENT]]'
export const OFFER_RESOURCES_MARKER = '[[RESOURCES]]'

function encodeMarker(marker: string, value: unknown, sanitize: (value: unknown) => unknown[]): string | null {
  const normalized = sanitize(value)
  if (normalized.length === 0) return null
  return `${marker}${encodeURIComponent(JSON.stringify(normalized))}`
}

function decodeMarker<T>(part: string | undefined, marker: string, sanitize: (value: unknown) => T[]): T[] | undefined {
  if (!part?.includes(marker)) return undefined
  try {
    const encoded = part.slice(part.indexOf(marker) + marker.length).trim()
    if (!encoded) return undefined
    const parsed = JSON.parse(decodeURIComponent(encoded))
    const normalized = sanitize(parsed)
    return normalized.length ? normalized : undefined
  } catch {
    return undefined
  }
}

export function formatOfferInputsMarker(value: unknown): string | null {
  return encodeMarker(OFFER_INPUTS_MARKER, value, sanitizeOfferInputFields)
}

export function parseOfferInputsMarker(part: string | undefined): OfferInputField[] | undefined {
  return decodeMarker(part, OFFER_INPUTS_MARKER, sanitizeOfferInputFields)
}

export function formatOfferAttributesMarker(value: unknown): string | null {
  return encodeMarker(OFFER_ATTRIBUTES_MARKER, value, sanitizeOfferAttributes)
}

export function parseOfferAttributesMarker(part: string | undefined): OfferAttribute[] | undefined {
  return decodeMarker(part, OFFER_ATTRIBUTES_MARKER, sanitizeOfferAttributes)
}

export function formatOfferRecurringMarker(value: unknown): string | null {
  const validated = validateRecurringServiceTerms(value)
  return validated.ok
    ? `${OFFER_RECURRING_MARKER}${encodeURIComponent(JSON.stringify(validated.value))}`
    : null
}

export function parseOfferRecurringMarker(part: string | undefined): RecurringServiceTerms | undefined {
  if (!part?.includes(OFFER_RECURRING_MARKER)) return undefined
  try {
    const encoded = part.slice(part.indexOf(OFFER_RECURRING_MARKER) + OFFER_RECURRING_MARKER.length).trim()
    if (!encoded) return undefined
    const validated = validateRecurringServiceTerms(JSON.parse(decodeURIComponent(encoded)))
    return validated.ok ? validated.value : undefined
  } catch {
    return undefined
  }
}

export function formatOfferFulfillmentMarker(value: unknown, inputs: OfferInputField[]): string | null {
  const validated = validateOfferFulfillmentRules(value, inputs)
  return validated.ok && validated.value.length
    ? `${OFFER_FULFILLMENT_MARKER}${encodeURIComponent(JSON.stringify(validated.value))}`
    : null
}

export function parseOfferFulfillmentMarker(
  part: string | undefined,
  inputs: OfferInputField[],
): OfferFulfillmentRule[] | undefined {
  if (!part?.includes(OFFER_FULFILLMENT_MARKER)) return undefined
  try {
    const encoded = part.slice(part.indexOf(OFFER_FULFILLMENT_MARKER) + OFFER_FULFILLMENT_MARKER.length).trim()
    if (!encoded) return undefined
    const validated = validateOfferFulfillmentRules(JSON.parse(decodeURIComponent(encoded)), inputs)
    return validated.ok && validated.value.length ? validated.value : undefined
  } catch {
    return undefined
  }
}

export function formatOfferStagedSettlementMarker(value: unknown): string | null {
  const validated = validateStagedSettlementTerms(value)
  return validated.ok
    ? `${OFFER_STAGED_SETTLEMENT_MARKER}${encodeURIComponent(JSON.stringify(validated.value))}`
    : null
}

export function parseOfferStagedSettlementMarker(part: string | undefined): StagedSettlementTerms | undefined {
  if (!part?.includes(OFFER_STAGED_SETTLEMENT_MARKER)) return undefined
  try {
    const encoded = part.slice(part.indexOf(OFFER_STAGED_SETTLEMENT_MARKER) + OFFER_STAGED_SETTLEMENT_MARKER.length).trim()
    if (!encoded) return undefined
    const validated = validateStagedSettlementTerms(JSON.parse(decodeURIComponent(encoded)))
    return validated.ok ? validated.value : undefined
  } catch {
    return undefined
  }
}

export function formatOfferResourcesMarker(value: unknown, inputs: OfferInputField[]): string | null {
  const validated = validateReservableResourceTerms(value, inputs)
  return validated.ok
    ? `${OFFER_RESOURCES_MARKER}${encodeURIComponent(JSON.stringify(validated.value))}`
    : null
}

export function parseOfferResourcesMarker(
  part: string | undefined,
  inputs: OfferInputField[],
): ReservableResourceTerms | undefined {
  if (!part?.includes(OFFER_RESOURCES_MARKER)) return undefined
  try {
    const encoded = part.slice(part.indexOf(OFFER_RESOURCES_MARKER) + OFFER_RESOURCES_MARKER.length).trim()
    if (!encoded) return undefined
    const validated = validateReservableResourceTerms(JSON.parse(decodeURIComponent(encoded)), inputs)
    return validated.ok ? validated.value : undefined
  } catch {
    return undefined
  }
}
