import 'server-only'

/**
 * Escape a value for safe use as a PostgREST `ilike`/`like` OPERAND (not a pattern). Neutralizes the
 * SQL LIKE metacharacters `%` and `_` and the escape char `\`, plus `*` — which PostgREST additionally
 * aliases to `%` at the URL layer before SQL. Without this, an email containing `_` (valid in the local
 * part) or `%` would wildcard-match OTHER users' rows. Mirrors the escaping in findOrdersByEmail.
 */
export function escapeLike(value: string): string {
  return (value || '').replace(/([\\%_*])/g, '\\$1')
}
