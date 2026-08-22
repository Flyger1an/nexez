import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { PUBLIC_PAGE_SELECT, type AgentPage } from '../agent-page'
import { publicLaunchVisiblePages } from '../public-page-visibility'

const PAGE_SIZE = 1000
export const PUBLIC_PAGE_FIELD_CAP = 1_000

export type PublicPageField = {
  pages: AgentPage[]
  complete: boolean
  totalPublished: number | null
  cap: number
}

/**
 * Load the competitive discovery field in stable pages instead of silently
 * examining only the newest 100 listings. The exact count lets callers label a
 * capped result honestly if the marketplace ever grows beyond the safety cap.
 */
export async function loadPublicPageField(
  client: SupabaseClient,
  cap = PUBLIC_PAGE_FIELD_CAP,
): Promise<PublicPageField> {
  const rows: AgentPage[] = []
  let totalPublished: number | null = null

  while (rows.length < cap) {
    const from = rows.length
    const to = Math.min(from + PAGE_SIZE - 1, cap - 1)
    const query = client
      .from('pages_public')
      .select(PUBLIC_PAGE_SELECT, from === 0 ? { count: 'exact' } : undefined)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<AgentPage[]>()
    const { data, error, count } = await query

    if (error) throw new Error(`Could not load the published discovery field: ${error.message}`)
    if (from === 0) totalPublished = count ?? null

    const page = data ?? []
    rows.push(...page)
    if (page.length < to - from + 1) break
  }

  const visible = publicLaunchVisiblePages(rows)
  return {
    pages: visible,
    complete: totalPublished == null ? rows.length < cap : totalPublished <= cap,
    totalPublished,
    cap,
  }
}
