import { PageEditor } from './usePageEditor'
import { PlanBadge } from '../billing/PlanGate'
import { shopifyConnectionCanSync } from './types'

export function IntegrationsHealthPanel({ e }: { e: PageEditor }) {
  const { integrationStatus: s, googleCalendarId, integrationResyncing, id } = e
  const page = e.page as any
  const premiumActive = e.integrationsEnabled
  const shopifyKind = s.shopify?.kind
  const shopifyCanSync = shopifyConnectionCanSync(shopifyKind, premiumActive)
  const shopifyDate = s.shopify?.lastImport ? new Date(s.shopify.lastImport).toLocaleDateString() : null

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
    <div className="mb-4 rounded-lg border border-[var(--bd-10)] bg-[var(--ov-02)] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Connected Tools</span>
        <a href="/dashboard/integrations" className="text-[10px] text-[var(--signal)] hover:text-[var(--signal)]">Full status →</a>
      </div>

      {/* Versioning + Outbound quick signals */}
      <div className="flex flex-wrap gap-2 text-xs mb-3">
        {page?.versions?.length > 0 && (
          <a href={`/dashboard/${id}/settings`} className="flex items-center gap-1 rounded border border-[var(--ready)]/30 bg-[var(--ready)]/5 px-2 py-1 text-[var(--ready)] hover:bg-[var(--ready)]/10">
            {page.versions.length} versions saved
          </a>
        )}
        {page?.outbound_webhooks?.length > 0 && (
          <span className={`flex items-center gap-1 rounded border px-2 py-1 ${e.outboundWebhooksEnabled ? 'border-[var(--signal)]/30 bg-[var(--signal)]/5 text-[var(--signal)]' : 'border-[var(--amber)]/30 bg-[var(--amber)]/5 text-[var(--amber)]'}`}>
            {page.outbound_webhooks.length} webhook URL{page.outbound_webhooks.length > 1 ? 's' : ''}{e.outboundWebhooksEnabled ? ' active' : ' retained · paused'}
          </span>
        )}
        {page?.team_collaboration?.approvals?.some((a: any) => a.status === 'pending') && (
          <span className={`rounded border px-2 py-1 text-xs ${e.teamCollaborationEnabled ? 'border-zinc-300/30 bg-zinc-400/5 text-[var(--fg-muted)]' : 'border-[var(--amber)]/30 bg-[var(--amber)]/5 text-[var(--amber)]'}`}>
            Team: {page.team_collaboration.approvals.filter((a: any) => a.status === 'pending').length} pending{e.teamCollaborationEnabled ? '' : ' · paused'}
          </span>
        )}
      </div>
      {e.teamCollaborationEnabled ? (
        <button type="button" onClick={e.requestTeamApproval} className="text-[10px] mt-1 text-[var(--signal)] hover:underline">
          Request approval for saved listing →
        </button>
      ) : (
        <div className="mt-1 text-[10px] text-[var(--fg-muted)]"><PlanBadge feature="teamCollaboration" /></div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {s.calendly && (
          <div className={`flex items-center gap-2 rounded border px-2 py-1 ${premiumActive ? 'border-[var(--signal)]/30 bg-[var(--signal)]/5 text-[var(--signal)]' : 'border-[var(--amber)]/30 bg-[var(--amber)]/5 text-[var(--amber)]'}`}>
            Calendly {premiumActive ? '✓' : '· paused by plan'} <span className="text-[10px] text-[var(--fg-muted)]">({new Date(s.calendly.lastSync).toLocaleDateString()})</span>
            {premiumActive ? <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('calendly')}
              className="ml-1 text-[10px] rounded border border-[var(--signal)]/50 px-1.5 py-0 text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-50"
            >
              {integrationResyncing === 'calendly' ? '...' : 'Re-sync'}
            </button> : null}
          </div>
        )}
        {s.stripe && (
          <div className="flex items-center gap-2 rounded border border-[var(--signal)]/30 bg-[var(--signal)]/5 px-2 py-1 text-[var(--signal)]">
            Stripe ✓ <span className="text-[10px] text-[var(--fg-muted)]">({new Date(s.stripe.lastImport).toLocaleDateString()})</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('stripe')}
              className="ml-1 text-[10px] rounded border border-[var(--signal)]/50 px-1.5 py-0 text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-50"
            >
              {integrationResyncing === 'stripe' ? '...' : 'Re-sync'}
            </button>
          </div>
        )}
        {s.shopify && (
          <div className={`flex items-center gap-2 rounded border px-2 py-1 ${shopifyCanSync ? 'border-[var(--signal)]/30 bg-[var(--signal)]/5 text-[var(--signal)]' : 'border-[var(--amber)]/30 bg-[var(--amber)]/5 text-[var(--amber)]'}`}>
            Shopify {shopifyKind === 'oauth'
              ? '✓ installed app · every plan'
              : shopifyKind === 'token'
                ? premiumActive ? '✓ manual Admin connection' : '· manual Admin connection paused by plan'
                : '· past public import · not a live connection'}
            {shopifyDate ? <span className="text-[10px] text-[var(--fg-muted)]">({shopifyDate})</span> : null}
            {shopifyCanSync ? <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('shopify')}
              className="ml-1 text-[10px] rounded border border-[var(--signal)]/50 px-1.5 py-0 text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-50"
            >
              {integrationResyncing === 'shopify' ? '...' : 'Re-sync'}
            </button> : null}
          </div>
        )}
        {s.square && (
          <div className={`flex items-center gap-2 rounded border px-2 py-1 ${premiumActive ? 'border-[var(--signal)]/30 bg-[var(--signal)]/5 text-[var(--signal)]' : 'border-[var(--amber)]/30 bg-[var(--amber)]/5 text-[var(--amber)]'}`}>
            Square {premiumActive ? '✓' : '· paused by plan'} <span className="text-[10px] text-[var(--fg-muted)]">({new Date(s.square.lastImport).toLocaleDateString()})</span>
            {premiumActive ? <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('square')}
              className="ml-1 text-[10px] rounded border border-[var(--signal)]/50 px-1.5 py-0 text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-50"
            >
              {integrationResyncing === 'square' ? '...' : 'Re-sync'}
            </button> : null}
          </div>
        )}
        {s.acuity && (
          <div className="flex items-center gap-2 rounded border border-[var(--amber)]/30 bg-[var(--amber)]/5 px-2 py-1 text-[var(--amber)]">
            Acuity {premiumActive ? '✓' : '· paused by plan'} <span className="text-[10px] text-[var(--fg-muted)]">({new Date(s.acuity.lastImport).toLocaleDateString()})</span>
            {premiumActive ? <button
              type="button"
              disabled={busy}
              onClick={() => e.resyncIntegration('acuity')}
              className="ml-1 text-[10px] rounded border border-[var(--amber)]/50 px-1.5 py-0 text-[var(--amber)] hover:bg-[var(--amber)]/10 disabled:opacity-50"
            >
              {integrationResyncing === 'acuity' ? '...' : 'Re-sync'}
            </button> : null}
          </div>
        )}
        {googleCalendarId && (
          <div className="flex items-center gap-2 rounded border border-[var(--ready)]/30 bg-[var(--ready)]/5 px-2 py-1 text-[var(--ready)]">
            Google availability {premiumActive ? '· configured' : '· sync paused by plan'} <span className="text-[10px] text-[var(--fg-muted)]">({googleCalendarId.includes('@') ? googleCalendarId.split('@')[0] + '...' : googleCalendarId.slice(0, 10) + '...'})</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] text-[var(--fg-muted-2)]">
        {premiumActive
          ? 'Re-sync pulls fresh offers from your saved connection - no token needed - and merges them in place (your manual offers are never touched).'
          : 'Connected premium providers are retained after downgrade, but new imports and automation are paused. The installed Shopify app remains active on every plan.'}{' '}
        Connect, disconnect, and manage every integration in <a href={`/dashboard/${id}/settings`} className="underline">Settings → Integrations</a>.
      </p>
      <div className="mt-2 text-[10px] text-[var(--ready)]">Webhooks and live Google availability are managed in Settings.</div>
      <div className="mt-1 text-[10px] text-[var(--fg-muted)]">Last sync times appear in the badges.</div>
    </div>
  )
}
