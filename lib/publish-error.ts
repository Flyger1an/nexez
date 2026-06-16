/**
 * Turn a Supabase write error from a publish attempt into a user-facing message.
 * The published-page limit is enforced by a DB trigger that raises a
 * check_violation (SQLSTATE 23514) with a friendly message + hint; surface those
 * directly, and fall back to a generic message for anything else.
 *
 * Shared by every dashboard publish surface (PagesManager, DashboardClient) so
 * the limit nudge reads consistently regardless of which control was used.
 */
/** True when a publish write was rejected by the published-page limit trigger. */
export function isPublishLimitError(error: { code?: string; message?: string }): boolean {
  return error.code === '23514' || /published page limit/i.test(error.message ?? '')
}

export function publishErrorMessage(error: { code?: string; message?: string; hint?: string }): string {
  if (isPublishLimitError(error)) return [error.message, error.hint].filter(Boolean).join(' ')
  return `Could not update this page: ${error.message ?? 'unknown error'}`
}
