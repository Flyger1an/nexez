export type ParsedNumericTerm =
  | { state: 'absent'; value: null }
  | { state: 'invalid'; value: null }
  | { state: 'valid'; value: number }

export type NormalizedNegotiationTerms = {
  scope: string[]
  revisionCount: ParsedNumericTerm
  projectWeeks: ParsedNumericTerm
}

const MAX_SCOPE_ITEMS = 20
const MAX_SCOPE_ITEM_LENGTH = 240

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function scopeItems(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((item) => {
    if (typeof item !== 'string') return []
    return item
      .split(/[\n,;|•]+/)
      .map((part) => part.trim().slice(0, MAX_SCOPE_ITEM_LENGTH))
      .filter(Boolean)
  })
}

function parseWholeNumber(values: unknown[], minimum: number): ParsedNumericTerm {
  if (!values.length) return { state: 'absent', value: null }
  const parsed = values.map((value) => {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
    return Number.NaN
  })
  if (parsed.some((value) => !Number.isSafeInteger(value) || value < minimum || value > 1_000)) {
    return { state: 'invalid', value: null }
  }
  if (new Set(parsed).size !== 1) return { state: 'invalid', value: null }
  return { state: 'valid', value: parsed[0] }
}

function valuesForAliases(
  root: Record<string, unknown>,
  nested: Record<string, unknown>,
  aliases: string[],
): unknown[] {
  return [root, nested].flatMap((source) => aliases.flatMap((key) => (
    hasOwn(source, key) ? [source[key]] : []
  )))
}

/**
 * Read only the small, documented transaction-term vocabulary. Unknown terms
 * remain available to the seller and LLM as free-form negotiation context, but
 * they cannot silently become deterministic approval authority.
 */
export function normalizeNegotiationTerms(value: unknown): NormalizedNegotiationTerms {
  const root = record(value)
  const nestedScope = record(root.scope)
  const scope = [
    ...(Object.keys(nestedScope).length
      ? [nestedScope.requested, nestedScope.included, nestedScope.items]
      : [root.scope]),
    root.deliverables,
  ].flatMap(scopeItems)

  return {
    scope: [...new Set(scope)].slice(0, MAX_SCOPE_ITEMS),
    revisionCount: parseWholeNumber(
      valuesForAliases(root, nestedScope, ['revisionCount', 'revisions', 'maxRevisions']),
      0,
    ),
    projectWeeks: parseWholeNumber(
      valuesForAliases(root, nestedScope, ['projectWeeks', 'durationWeeks', 'maxProjectWeeks']),
      1,
    ),
  }
}

function normalizedPhrase(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Exact phrase containment, not token scoring. This intentionally favors a
 * safe false negative over inventing semantic equivalence between two scopes. */
export function scopePhraseMatches(left: string, right: string): boolean {
  const a = normalizedPhrase(left)
  const b = normalizedPhrase(right)
  if (!a || !b) return false
  if (a === b) return true
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)
}

export function splitMerchantScope(value: string | null | undefined): string[] {
  return scopeItems(value)
}
