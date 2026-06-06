import { PageEditor } from './usePageEditor'

export function OutboundActivityCard({ e }: { e: PageEditor }) {
  const { recentOutboundFires } = e
  return (
    <div className="rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-cyan-300">Recent Outbound Webhook Activity</span>
        <span className="text-[10px] text-cyan-400/70">Auto-fired on bookings</span>
      </div>
      {recentOutboundFires.length > 0 ? (
        <div className="space-y-1 text-[11px]">
          {recentOutboundFires.slice(0, 4).map((evt: any, idx: number) => (
            <div key={idx} className="flex justify-between text-cyan-200">
              <span>{evt.event_type.replace(/_/g, ' ')} — {evt.offer_name}</span>
              <span className="text-cyan-400/70">{new Date(evt.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
          <div className="mt-1 text-[9px] text-cyan-300/80">Fired to your configured endpoints (with signing when set).</div>
        </div>
      ) : (
        <div className="text-[11px] text-cyan-200">
          Outbound endpoints fire automatically on real bookings (Nexez checkout + Calendly webhooks).
          Use "Send Test" in Settings to verify instantly.
        </div>
      )}
      <div className="mt-2 text-[9px] text-cyan-200/70">
        Configure per-page in Settings. Full history + export in Analytics.
      </div>
    </div>
  )
}
