import { PageEditor } from './usePageEditor'

export function IntegrationsHealthPanel({ e }: { e: PageEditor }) {
  const { integrationStatus: s, googleCalendarId, integrationResyncing, id } = e
  const page = e.page as any

  const show =
    s.calendly ||
    s.stripe ||
    s.shopify ||
    s.square ||
    s.acuity ||
    googleCalendarId ||
    page?.versions?.length > 0 ||
    page?.outbound_webhooks?.length > 0
  if (!show) return null

  const busy = !!integrationResyncing

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-300">Connected Integrations & Health</span>
        <a href="/dashboard/integrations" className="text-[10px] text-cyan-400 hover:text-cyan-300">Full status →</a>
      </div>

      {/* Versioning + Outbound quick signals */}
      <div className="flex flex-wrap gap-2 text-xs mb-3">
        {page?.versions?.length > 0 && (
          <a href={`/dashboard/${id}/settings`} className="flex items-center gap-1 rounded border border-emerald-300/30 bg-emerald-400/5 px-2 py-1 text-emerald-200 hover:bg-emerald-400/10">
            {page.versions.length} versions saved
          </a>
        )}
        {page?.outbound_webhooks?.length > 0 && (
          <span className="flex items-center gap-1 rounded border border-cyan-300/30 bg-cyan-400/5 px-2 py-1 text-cyan-200">
            {page.outbound_webhooks.length} outbound endpoint{page.outbound_webhooks.length > 1 ? 's' : ''} active
          </span>
        )}
        {page?.team_collaboration?.approvals?.some((a: any) => a.status === 'pending') && (
          <span className="rounded border border-zinc-300/30 bg-zinc-400/5 px-2 py-1 text-xs text-zinc-300">
            Team: {page.team_collaboration.approvals.filter((a: any) => a.status === 'pending').length} pending
          </span>
        )}
      </div>
      <button type="button" onClick={e.requestTeamApproval} className="text-[10px] mt-1 text-cyan-400 hover:underline">
        Request team approval for edits →
      </button>

      <div className="flex flex-wrap gap-2 text-xs">
        {s.calendly && (
          <div className="flex items-center gap-2 rounded border border-violet-300/30 bg-violet-400/5 px-2 py-1 text-violet-200">
            Calendly ✓ <span className="text-[10px] text-zinc-400">({new Date(s.calendly.lastSync).toLocaleDateString()})</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('calendly')}
              className="ml-1 text-[10px] rounded border border-violet-300/50 px-1.5 py-0 text-violet-100 hover:bg-violet-400/10 disabled:opacity-50"
            >
              {integrationResyncing === 'calendly' ? '...' : 'Re-sync'}
            </button>
          </div>
        )}
        {s.stripe && (
          <div className="flex items-center gap-2 rounded border border-cyan-300/30 bg-cyan-400/5 px-2 py-1 text-cyan-200">
            Stripe ✓ <span className="text-[10px] text-zinc-400">({new Date(s.stripe.lastImport).toLocaleDateString()})</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('stripe')}
              className="ml-1 text-[10px] rounded border border-cyan-300/50 px-1.5 py-0 text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-50"
            >
              {integrationResyncing === 'stripe' ? '...' : 'Re-sync'}
            </button>
          </div>
        )}
        {s.shopify && (
          <div className="flex items-center gap-2 rounded border border-purple-300/30 bg-purple-400/5 px-2 py-1 text-purple-200">
            Shopify ✓ <span className="text-[10px] text-zinc-400">({new Date(s.shopify.lastImport).toLocaleDateString()})</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('shopify')}
              className="ml-1 text-[10px] rounded border border-purple-300/50 px-1.5 py-0 text-purple-100 hover:bg-purple-400/10 disabled:opacity-50"
            >
              {integrationResyncing === 'shopify' ? '...' : 'Re-sync'}
            </button>
          </div>
        )}
        {s.square && (
          <div className="flex items-center gap-2 rounded border border-pink-300/30 bg-pink-400/5 px-2 py-1 text-pink-200">
            Square ✓ <span className="text-[10px] text-zinc-400">({new Date(s.square.lastImport).toLocaleDateString()})</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('square')}
              className="ml-1 text-[10px] rounded border border-pink-300/50 px-1.5 py-0 text-pink-100 hover:bg-pink-400/10 disabled:opacity-50"
            >
              {integrationResyncing === 'square' ? '...' : 'Re-sync'}
            </button>
          </div>
        )}
        {s.acuity && (
          <div className="flex items-center gap-2 rounded border border-orange-300/30 bg-orange-400/5 px-2 py-1 text-orange-200">
            Acuity ✓ <span className="text-[10px] text-zinc-400">({new Date(s.acuity.lastImport).toLocaleDateString()})</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('acuity')}
              className="ml-1 text-[10px] rounded border border-orange-300/50 px-1.5 py-0 text-orange-100 hover:bg-orange-400/10 disabled:opacity-50"
            >
              {integrationResyncing === 'acuity' ? '...' : 'Re-sync'}
            </button>
          </div>
        )}
        {googleCalendarId && (
          <div className="flex items-center gap-2 rounded border border-emerald-300/30 bg-emerald-400/5 px-2 py-1 text-emerald-200">
            Google Calendar ✓ <span className="text-[10px] text-zinc-400">({googleCalendarId.includes('@') ? googleCalendarId.split('@')[0] + '...' : googleCalendarId.slice(0, 10) + '...'})</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        Re-sync keeps source metadata (via stripe, via shopify, etc.) and feeds the smart merge preview. Stripe price webhooks are now active — price.updated events auto-update matching offers. Full control in <a href={`/dashboard/${id}/settings`} className="underline">Settings</a> or <a href="/dashboard/tools" className="underline">Tools</a>.
      </p>
      <div className="mt-2 text-[10px] text-emerald-300">Outbound webhooks + Google Calendar availability — full management in Settings</div>
      <div className="mt-1 text-[10px] text-zinc-400">Last re-sync times shown in badges • Full health in /dashboard/integrations</div>
    </div>
  )
}
