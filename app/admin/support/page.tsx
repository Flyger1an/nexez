import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Inbox,
  MailCheck,
} from 'lucide-react'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getAdminSupportQueue, type AdminSupportTicket } from '../../../lib/server/support-operations'

const STATUS_LABEL: Record<AdminSupportTicket['status'], string> = {
  open: 'Open',
  in_review: 'In review',
  waiting_on_user: 'Waiting on requester',
  resolved: 'Resolved',
  closed: 'Closed',
}

export default async function AdminSupportPage() {
  await requirePlatformAdmin('/admin/support')
  const tickets = await getAdminSupportQueue()
  const active = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status))
  const urgent = active.filter((ticket) => ticket.priority === 'urgent')
  const failedDelivery = tickets.filter((ticket) => ticket.notificationStatus !== 'sent')

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]"><Inbox className="size-4" /> Support operations</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Support desk</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">Review requests, verify inbox delivery, record follow-up, and close the loop from one protected workspace.</p>
          </div>
          <span className="inline-flex min-h-9 w-fit items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 text-xs text-[var(--fg-muted)]"><Clock3 className="size-3.5" /> Newest 100 requests</span>
        </header>

        <section aria-label="Support summary" className="grid gap-3 py-6 sm:grid-cols-3">
          <SummaryCard icon={Inbox} label="Active" value={String(active.length)} detail="Open, in review, or waiting" />
          <SummaryCard icon={AlertTriangle} label="Urgent" value={String(urgent.length)} detail="Active urgent requests" tone={urgent.length ? 'attention' : 'ready'} />
          <SummaryCard icon={failedDelivery.length ? AlertTriangle : MailCheck} label="Inbox delivery" value={failedDelivery.length ? `${failedDelivery.length} need review` : 'Healthy'} detail="Email handoff for loaded requests" tone={failedDelivery.length ? 'attention' : 'ready'} />
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
            <div><h2 className="text-base font-semibold tracking-tight">Support queue</h2><p className="mt-1 text-xs text-[var(--fg-muted)]">Requester details are available only inside this admin surface.</p></div>
            <span className="font-mono text-xs text-[var(--fg-muted-2)]">{tickets.length}</span>
          </div>
          {tickets.length ? (
            <div className="divide-y divide-border">
              {tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
            </div>
          ) : (
            <div className="flex min-h-44 items-center gap-3 px-5 py-6"><CheckCircle2 className="size-5 text-[var(--ready)]" /><div><p className="text-sm font-medium">No support requests yet</p><p className="mt-1 text-xs text-[var(--fg-muted)]">New persisted requests will appear here immediately.</p></div></div>
          )}
        </section>
      </div>
    </main>
  )
}

function TicketRow({ ticket }: { ticket: AdminSupportTicket }) {
  const active = !['resolved', 'closed'].includes(ticket.status)
  return (
    <Link href={`/admin/support/${ticket.id}`} className="grid gap-3 px-4 py-4 transition hover:bg-white/[0.04] lg:grid-cols-[minmax(0,1.3fr)_minmax(180px,.7fr)_auto] lg:items-center">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{ticket.subject}</span>{ticket.priority === 'urgent' ? <span className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] text-red-300">Urgent</span> : null}</span>
        <span className="mt-1 block truncate text-xs text-[var(--fg-muted)]">{ticket.requesterEmail ?? 'Requester email unavailable'} · {ticket.pageName ?? 'Workspace'}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2 text-[10px]">
        <span className={`rounded-full border px-2 py-1 ${active ? 'border-[var(--amber)]/25 bg-[var(--amber)]/10 text-[var(--amber)]' : 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]'}`}>{STATUS_LABEL[ticket.status]}</span>
        <span className={`rounded-full border px-2 py-1 ${ticket.notificationStatus === 'sent' ? 'border-[var(--ready)]/25 text-[var(--ready)]' : 'border-red-400/30 text-red-300'}`}>{ticket.notificationStatus === 'sent' ? 'Inbox sent' : 'Email needs review'}</span>
      </span>
      <span className="flex items-center justify-between gap-3 lg:justify-end"><time className="text-[10px] text-[var(--fg-muted-2)]">{formatDate(ticket.createdAt)}</time><ArrowRight className="size-3.5 text-[var(--fg-muted-2)]" /></span>
    </Link>
  )
}

function SummaryCard({ icon: Icon, label, value, detail, tone = 'neutral' }: { icon: typeof Inbox; label: string; value: string; detail: string; tone?: 'neutral' | 'ready' | 'attention' }) {
  const iconClass = tone === 'ready' ? 'text-[var(--ready)]' : tone === 'attention' ? 'text-[var(--amber)]' : 'text-[var(--fg-muted-2)]'
  return <article className="rounded-lg border border-border bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-[var(--fg-muted)]">{label}</span><Icon className={`size-4 ${iconClass}`} /></div><p className="mt-3 font-mono text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-[var(--fg-muted)]">{detail}</p></article>
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
