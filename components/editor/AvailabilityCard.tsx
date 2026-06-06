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
        <a href="#next-available" className="text-[10px] text-cyan-400 hover:text-cyan-300">Edit →</a>
      </div>
      <div className="text-sm text-emerald-200">
        {nextAvailable ? nextAvailable.split(' ||WINDOWS||')[0] : 'Not set — agents will see "Contact for current slots"'}
      </div>
      {googleCalendarId && (
        <div className="mt-1 text-[10px] text-emerald-300">Google Calendar connected • ID: {googleCalendarId}</div>
      )}
      {page.availability && (
        <div className="mt-1 text-[10px] text-emerald-300">Structured availability exposed for agents</div>
      )}
      {wins && wins.length > 0 && (
        <div className="mt-2 text-[10px] text-emerald-300">
          Upcoming preview: {wins.slice(0, 3).map((w: any) => w.label || `${w.start}`).join(' • ')}
        </div>
      )}
      <p className="mt-1 text-[10px] text-zinc-500">
        Import in Settings now generates real upcoming windows (stub). Shown in agent.json + public page.
        Outbound webhooks fire automatically on bookings (configure in Settings).
      </p>
      {nextAvailable && (
        <div className="mt-1 text-[10px] text-emerald-300">Availability data live for agents</div>
      )}
      <div className="mt-1 text-[10px] text-zinc-400">Google Calendar import produces concrete upcoming slots for agents (see Settings)</div>
      <div className="mt-1 text-[10px] text-emerald-300">
        {page.outbound_webhooks?.length
          ? `${page.outbound_webhooks.length} outbound endpoint${page.outbound_webhooks.length === 1 ? '' : 's'} configured (fires on bookings)`
          : 'No outbound webhooks yet — configure in Settings'}
      </div>
      <div className="mt-1 text-[9px] text-zinc-500">Secrets supported • Test from Settings • Fires on real Nexez + Calendly events</div>
      {typeof window !== 'undefined' && localStorage.getItem('nexez_last_outbound_fired') && (
        <div className="mt-1 text-[9px] text-emerald-300">Last outbound fire: {new Date(localStorage.getItem('nexez_last_outbound_fired')!).toLocaleString()}</div>
      )}
      <div className="mt-1 text-[9px] text-cyan-300/70">Per-page endpoints configured in Settings now fire automatically on booking events.</div>
      <div className="mt-1 text-[9px] text-emerald-300/80">Real events (checkout + Calendly) trigger your systems with optional signing.</div>
      <a href={`/dashboard/${id}/settings`} className="mt-1 inline-block text-[9px] text-cyan-400 hover:underline">Manage versions & outbound history in Settings →</a>
    </div>
  )
}
