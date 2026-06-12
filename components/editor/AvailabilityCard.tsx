import { parseAvailabilityWindows } from '../../lib/agent-page'
import { PageEditor } from './usePageEditor'

export function AvailabilityCard({ e }: { e: PageEditor }) {
  const { nextAvailable, googleCalendarId, id } = e
  const page = e.page as any
  const wins = parseAvailabilityWindows(nextAvailable)

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-zinc-300">Availability for agents</span>
        <a href="#next-available" className="text-[10px] text-[var(--signal)] hover:text-[var(--signal)]">Edit →</a>
      </div>
      <div className="text-sm text-[var(--ready)]">
        {nextAvailable ? nextAvailable.split(' ||WINDOWS||')[0] : 'Not set — agents will see "Contact for current slots"'}
      </div>
      {googleCalendarId && (
        <div className="mt-1 text-[10px] text-[var(--ready)]">Google Calendar connected</div>
      )}
      {page.availability && (
        <div className="mt-1 text-[10px] text-[var(--ready)]">Upcoming slots ready for agents</div>
      )}
      {wins && wins.length > 0 && (
        <div className="mt-2 text-[10px] text-[var(--ready)]">
          Upcoming preview: {wins.slice(0, 3).map((w: any) => w.label || `${w.start}`).join(' • ')}
        </div>
      )}
      <p className="mt-1 text-[10px] text-zinc-500">
        Import availability in Settings to show upcoming windows on the public page and in agent data.
        Booking webhooks fire automatically when configured.
      </p>
      {nextAvailable && (
        <div className="mt-1 text-[10px] text-[var(--ready)]">Availability data live for agents</div>
      )}
      <div className="mt-1 text-[10px] text-zinc-400">Google Calendar import adds upcoming slots for agents.</div>
      <div className="mt-1 text-[10px] text-[var(--ready)]">
        {page.outbound_webhooks?.length
          ? `${page.outbound_webhooks.length} webhook URL${page.outbound_webhooks.length === 1 ? '' : 's'} configured`
          : 'No booking webhooks yet — configure in Settings'}
      </div>
      <div className="mt-1 text-[9px] text-zinc-500">Test events and signing protection are available in Settings.</div>
      {typeof window !== 'undefined' && localStorage.getItem('nexez_last_outbound_fired') && (
        <div className="mt-1 text-[9px] text-[var(--ready)]">Last webhook update: {new Date(localStorage.getItem('nexez_last_outbound_fired')!).toLocaleString()}</div>
      )}
      <div className="mt-1 text-[9px] text-[var(--signal)]/70">Page webhooks configured in Settings notify automatically on booking events.</div>
      <div className="mt-1 text-[9px] text-[var(--ready)]/80">Checkout and Calendly bookings can notify your connected systems.</div>
      <a href={`/dashboard/${id}/settings`} className="mt-1 inline-block text-[9px] text-[var(--signal)] hover:underline">Manage availability and webhook history in Settings →</a>
    </div>
  )
}
