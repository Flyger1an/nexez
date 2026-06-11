import { PageEditor } from './usePageEditor'

export function OutboundActivityCard({ e }: { e: PageEditor }) {
  const { recentOutboundFires } = e
  return (
    <div className="rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-cyan-300">Recent Outbound Webhook Activity</span>
        <span className="text-[10px] text-cyan-400/70">Automatic on bookings</span>
      </div>
      {recentOutboundFires.length > 0 ? (
        <div className="space-y-1 text-[11px]">
          {recentOutboundFires.slice(0, 4).map((evt: any, idx: number) => (
            <div key={idx} className="flex justify-between text-cyan-200">
              <span>{evt.event_type.replace(/_/g, ' ')} — {evt.offer_name}</span>
              <span className="text-cyan-400/70">{new Date(evt.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
          <div className="mt-1 text-[9px] text-cyan-300/80">Sent to your configured webhook URLs.</div>
        </div>
      ) : (
        <div className="text-[11px] text-cyan-200">
          Webhook URLs are notified automatically when bookings happen through Nexez or Calendly.
          Use "Send Test" in Settings to verify instantly.
        </div>
      )}
      <div className="mt-2 text-[9px] text-cyan-200/70">
        Configure per-page in Settings. Full history + export in Analytics.
      </div>
    </div>
  )
}
