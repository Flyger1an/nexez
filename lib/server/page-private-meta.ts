import 'server-only'

import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

export type PagePrivateMeta = {
  ownerId: string | null
  googleCalendarId: string | null
}

export async function getPagePrivateMeta(pageId: string | null | undefined): Promise<PagePrivateMeta> {
  if (!pageId || !hasSupabaseAdminEnv()) return { ownerId: null, googleCalendarId: null }

  try {
    const { data } = await createAdminClient()
      .from('pages')
      .select('owner_id, google_calendar_id')
      .eq('id', pageId)
      .maybeSingle<{ owner_id: string | null; google_calendar_id: string | null }>()

    return {
      ownerId: data?.owner_id ?? null,
      googleCalendarId: data?.google_calendar_id ?? null,
    }
  } catch {
    return { ownerId: null, googleCalendarId: null }
  }
}

