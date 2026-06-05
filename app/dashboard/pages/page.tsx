import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '../../../utils/supabase/server'
import { AgentPage, BASIC_OWNER_PAGE_SELECT, OWNER_PAGE_SELECT } from '../../../lib/agent-page'
import { CheckoutEvent } from '../../../lib/checkout-events'
import { PagesManager } from '../../../components/PagesManager'

type Status = 'all' | 'published' | 'draft'

// Server component: auth + fetch the owner's pages (and per-page signal counts),
// then hand off to the client manager. The status filter comes from the URL so
// the nav's Published / Drafts sub-items deep-link straight into a filtered view.
export default async function PagesRoute({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/pages')

  const sp = await searchParams
  const status: Status = sp.status === 'published' ? 'published' : sp.status === 'draft' ? 'draft' : 'all'

  const [pageRes, eventRes] = await Promise.all([
    supabase.from('pages').select(OWNER_PAGE_SELECT).eq('owner_id', user.id).order('created_at', { ascending: false }).returns<AgentPage[]>(),
    supabase.from('checkout_events').select('page_id').eq('owner_id', user.id).limit(2000).returns<Pick<CheckoutEvent, 'page_id'>[]>(),
  ])

  let pages = pageRes.error ? [] : pageRes.data ?? []
  if (pageRes.error) {
    const basic = await supabase
      .from('pages')
      .select(BASIC_OWNER_PAGE_SELECT)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .returns<AgentPage[]>()
    pages = basic.data ?? []
  }

  const signalsByPageId: Record<string, number> = {}
  for (const e of eventRes.data ?? []) {
    if (e.page_id) signalsByPageId[e.page_id] = (signalsByPageId[e.page_id] ?? 0) + 1
  }

  return <PagesManager initialPages={pages} signalsByPageId={signalsByPageId} status={status} />
}
