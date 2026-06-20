import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '../../../utils/supabase/server'
import { AgentPage, OWNER_PAGE_SELECT } from '../../../lib/agent-page'
import { EditorInitial } from '../../../components/editor/types'
import { EditorClient } from './EditorClient'

type PageProps = {
  params: Promise<{ id: string }>
}

// Server component: authenticates, fetches the page + its activity in one
// parallel wave, enforces access, and hands everything to the client island as
// initial state — so the editor renders with real data (no client fetch
// waterfall, no loading flash, no client-side redirects).
export default async function EditAgentPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware gates /dashboard/*; redirect is a defensive backstop.
  if (!user) redirect(`/login?next=/dashboard/${id}`)

  const { data, error } = await supabase
    .from('pages')
    .select(OWNER_PAGE_SELECT)
    .eq('id', id)
    .maybeSingle<AgentPage>()

  if (error || !data) {
    return (
      <main className="min-h-screen bg-zinc-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
            Listing not found, or you do not have access to edit it.
          </p>
        </div>
      </main>
    )
  }

  // Editing requires ownership OR an editor-role team invite (RLS enforces saves
  // too; this gives a clear redirect for view-only collaborators who reached a
  // published page via public read).
  if (data.owner_id !== user.id) {
    const { data: invites } = await supabase
      .from('team_invites')
      .select('role')
      .eq('owner_id', data.owner_id as string)
      .ilike('email', user.email ?? '')
      .neq('status', 'revoked')
      .limit(1)
    if (invites?.[0]?.role !== 'editor') {
      redirect(`/${data.slug}`)
    }
  }

  const [secretsRes, calendlyRes, outboundRes, trustRes] = await Promise.all([
    supabase.from('page_secrets').select('outbound_webhooks').eq('page_id', id).maybeSingle(),
    supabase
      .from('checkout_events')
      .select('*')
      .eq('slug', data.slug)
      .contains('metadata', { source: 'calendly_webhook' })
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('checkout_events')
      .select('id, event_type, offer_name, created_at')
      .eq('slug', data.slug)
      .in('event_type', ['provider_redirect', 'stripe_session_created', 'checkout_attempt'])
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('checkout_events')
      .select('*')
      .eq('slug', data.slug)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const page = {
    ...data,
    outbound_webhooks: (secretsRes.data as { outbound_webhooks?: unknown } | null)?.outbound_webhooks ?? null,
  } as AgentPage

  const initial: EditorInitial = {
    page,
    recentCalendlyBookings: calendlyRes.data ?? [],
    recentOutboundFires: outboundRes.data ?? [],
    trustEvents: trustRes.data ?? [],
  }

  return <EditorClient initial={initial} />
}
