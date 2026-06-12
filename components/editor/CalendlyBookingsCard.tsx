import { PageEditor } from './usePageEditor'

export function CalendlyBookingsCard({ e }: { e: PageEditor }) {
  const { lastBooking, recentCalendlyBookings } = e
  if (!lastBooking && recentCalendlyBookings.length === 0) return null

  return (
    <div className="rounded-lg border border-[var(--ready)]/20 bg-[var(--ready)]/5 p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[var(--ready)]">Recent Calendly Bookings (via webhook)</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--ready)]/70">Live from webhooks</span>
          <button
            type="button"
            onClick={e.sendTestBooking}
            className="text-[10px] rounded border border-[var(--ready)]/40 px-2 py-0.5 text-[var(--ready)] hover:bg-[var(--ready)]/10"
          >
            Send test booking
          </button>
        </div>
      </div>
      {lastBooking && (
        <div className="mb-2 text-sm">
          <span className="font-medium text-[var(--ready)]">Last:</span> {lastBooking.event_name} with {lastBooking.invitee_name}
          <span className="ml-2 text-xs text-zinc-500">({new Date(lastBooking.at).toLocaleString()})</span>
        </div>
      )}
      {recentCalendlyBookings.length > 0 && (
        <div className="space-y-1 text-xs">
          {recentCalendlyBookings.slice(0, lastBooking ? 2 : 3).map((evt: any, idx: number) => (
            <div key={idx} className="flex justify-between text-zinc-300">
              <span>{evt.offer_name} — {evt.metadata?.invitee_name || 'Guest'}</span>
              <span className="text-zinc-500">{new Date(evt.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
