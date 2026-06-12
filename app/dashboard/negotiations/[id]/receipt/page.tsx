import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import {
  AgentNegotiation,
  formatNegotiationAmount,
  getNegotiationStatusLabel,
} from '../../../../../lib/negotiations'
import { getBaseUrl } from '../../../../../lib/agent-page'

export default async function NegotiationReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0F] text-white">
        <a href={`/login?next=/dashboard/negotiations/${id}/receipt`} className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950">
          Sign in to view receipt
        </a>
      </main>
    )
  }

  const { data: n } = await supabase
    .from('agent_negotiations')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle<AgentNegotiation>()

  if (!n) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0F] text-white">
        <p className="text-zinc-400">Receipt not found.</p>
      </main>
    )
  }

  const terms = n.requested_terms && Object.keys(n.requested_terms).length ? JSON.stringify(n.requested_terms) : null

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--signal)] to-[var(--ready)]">
                <span className="text-sm font-bold text-[#0A0A0F]">N</span>
              </div>
              <span className="font-semibold">Nexez · Agreement Receipt</span>
            </div>
            <span className="rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-2.5 py-0.5 text-xs text-[var(--ready)]">
              {getNegotiationStatusLabel(n.status)}
            </span>
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <Row label="Offer" value={n.offer_name} />
            <Row label="Amount" value={formatNegotiationAmount(n.amount_cents, n.currency)} />
            <Row label="Page" value={`${getBaseUrl()}/${n.slug}`} />
            <Row label="Buyer agent" value={n.buyer_agent || '—'} />
            <Row label="Contact" value={n.contact || '—'} />
            <Row label="Budget" value={n.budget_text || '—'} />
            <Row label="Timeline" value={n.timeline_text || '—'} />
            {n.buyer_query ? <Row label="Request" value={n.buyer_query} /> : null}
            {terms ? <Row label="Requested terms" value={terms} mono /> : null}
            <Row label="Reference" value={n.id} mono />
            <Row label="Created" value={new Date(n.created_at).toLocaleString()} />
          </dl>

          <p className="mt-6 border-t border-white/10 pt-4 text-[11px] text-zinc-500">
            This receipt records the agreed terms of an agent-to-agent negotiation facilitated by Nexez. Escrow/payment
            status reflects the negotiation’s current state.
          </p>
        </div>

        <p className="mt-4 text-[11px] text-zinc-500 print:hidden">
          Tip: use your browser’s Print (⌘/Ctrl-P) to save this receipt as a PDF or share it.
        </p>
      </div>
    </main>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`text-right text-zinc-200 ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
