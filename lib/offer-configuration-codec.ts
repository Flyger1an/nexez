import {
  sanitizeOfferAttributes,
  sanitizeOfferInputFields,
  type OfferAttribute,
  type OfferInputField,
} from './offer-configuration'
import { validateRecurringServiceTerms, type RecurringServiceTerms } from './recurring-service'

/** Pipe-safe markers used by the legacy offer-line editor/import codec. */
export const OFFER_INPUTS_MARKER = '[[INPUTS]]'
export const OFFER_ATTRIBUTES_MARKER = '[[ATTRIBUTES]]'
export const OFFER_RECURRING_MARKER = '[[RECURRING]]'

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
