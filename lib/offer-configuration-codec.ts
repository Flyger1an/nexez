import {
  sanitizeOfferAttributes,
  sanitizeOfferInputFields,
  type OfferAttribute,
  type OfferInputField,
} from './offer-configuration'

/**
 * Pipe-safe markers used by the legacy offer-line editor/import codec.
 *
 * The existing line format uses `|` as its field delimiter. Configuration
 * labels/options are arbitrary merchant text and may legitimately contain a
 * pipe, so raw JSON cannot be appended safely. URI-encoding keeps each marker
 * inside one delimiter slot and makes malformed payloads fail closed.
 */
export const OFFER_INPUTS_MARKER = '[[INPUTS]]'
export const OFFER_ATTRIBUTES_MARKER = '[[ATTRIBUTES]]'

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
