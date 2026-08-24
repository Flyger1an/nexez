import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  Mail,
  MailWarning,
  MessageSquareText,
  UserRound,
} from 'lucide-react'
import { SupportTicketActions } from '../../../../components/admin/SupportTicketActions'
import { requirePlatformAdmin } from '../../../../lib/server/admin-access'
import { getAdminSupportTicket, type AdminSupportEvent } from '../../../../lib/server/support-operations'

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePlatformAdmin(`/admin/support/${id}`)
  const result = await getAdminSupportTicket(id)
  if (!result) notFound()

  const { ticket, events } = result
  const replyHref = ticket.requesterEmail
    ? `mailto:${ticket.requesterEmail}?subject=${encodeURIComponent(`Re: ${ticket.subject} [${ticket.id.slice(0, 8)}]`)}`
    : null

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Link href="/admin/support" className="inline-flex items-center gap-2 text-xs text-[var(--fg-muted)] transition hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to support desk</Link>
        <header className="mt-5 flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border border-border bg-white/[0.04] px-2 py-1 capitalize">{ticket.status.replaceAll('_', ' ')}</span><span className="rounded-full border border-border px-2 py-1 capitalize">{ticket.priority}</span><span className="font-mono text-[var(--fg-muted-2)]">{ticket.id}</span></div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{ticket.subject}</h1>
            <p className="mt-3 text-sm text-[var(--fg-muted)]">Received {formatDate(ticket.createdAt)} from {ticket.requesterEmail ?? 'an unknown requester'}.</p>
          </div>
          {replyHref ? <a href={replyHref} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-[var(--signal)] px-4 text-sm font-semibold text-black transition hover:brightness-110"><Mail className="size-4" /> Reply by email <ExternalLink className="size-3.5" /></a> : null}
        </header>

        <section className="grid gap-5 py-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <div className="space-y-5">
            <article className="rounded-lg border border-border bg-white/[0.025] p-5">
              <div className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="size-4 text-[var(--signal)]" /> Request</div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--fg-soft)]">{ticket.query}</p>
              {ticket.aiResponse ? <div className="mt-5 border-t border-border pt-5"><p className="text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">Nexez answer shown before escalation</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--fg-muted)]">{ticket.aiResponse}</p></div> : null}
            </article>

            <article className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
              <div className="border-b border-border px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-[var(--fg-muted)]" /> Activity</h2></div>
              <div className="divide-y divide-border">
                {events.map((event) => <EventRow key={event.id} event={event} />)}
                <div className="flex gap-3 px-5 py-4"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--ready)]/25 bg-[var(--ready)]/10"><CheckCircle2 className="size-3.5 text-[var(--ready)]" /></span><div><p className="text-sm font-medium">Request created</p><p className="mt-1 text-xs text-[var(--fg-muted)]">{formatDate(ticket.createdAt)}</p></div></div>
              </div>
            </article>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-border bg-white/[0.025] p-5"><h2 className="text-sm font-semibold">Update request</h2><p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Status changes and notes are written to the operator history.</p><div className="mt-5"><SupportTicketActions ticketId={ticket.id} status={ticket.status} /></div></section>
            <section className="rounded-lg border border-border bg-white/[0.025] p-5"><h2 className="text-sm font-semibold">Request details</h2><dl className="mt-4 divide-y divide-border text-xs"><Detail label="Requester" value={ticket.requesterEmail} icon={UserRound} /><Detail label="Target" value={ticket.pageName ?? 'Workspace'} /><Detail label="Category" value={ticket.category.replaceAll('_', ' ')} /><Detail label="Support level" value={ticket.supportTier ?? 'standard'} /><Detail label="Reference" value={ticket.reference} /></dl></section>
            <section className={`rounded-lg border p-5 ${ticket.notificationStatus === 'sent' ? 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.05]' : 'border-red-400/30 bg-red-400/[0.05]'}`}>
              <h2 className="flex items-center gap-2 text-sm font-semibold">{ticket.notificationStatus === 'sent' ? <Mail className="size-4 text-[var(--ready)]" /> : <MailWarning className="size-4 text-red-300" />} Inbox delivery</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">{ticket.notificationStatus === 'sent' ? `Sent to support@nexez.ai${ticket.notifiedAt ? ` on ${formatDate(ticket.notifiedAt)}` : ''}.` : 'The support inbox handoff needs operator review. The request remains safely persisted here.'}</p>
              {ticket.notificationEmailId ? <p className="mt-3 break-all font-mono text-[10px] text-[var(--fg-muted-2)]">{ticket.notificationEmailId}</p> : null}
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}

function EventRow({ event }: { event: AdminSupportEvent }) {
  const statusChange = event.eventType === 'status_changed'
  const title = event.eventType === 'email_sent'
    ? 'Inbox notification sent'
    : event.eventType === 'email_failed'
      ? 'Inbox notification failed'
      : statusChange
        ? `Status changed to ${(event.toStatus ?? '').replaceAll('_', ' ')}`
        : 'Operator note added'
  return <div className="flex gap-3 px-5 py-4"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-white/[0.04]">{event.eventType.startsWith('email_') ? <Mail className="size-3.5 text-[var(--fg-muted)]" /> : <Clock3 className="size-3.5 text-[var(--fg-muted)]" />}</span><div className="min-w-0"><p className="text-sm font-medium capitalize">{title}</p>{event.note ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--fg-muted)]">{event.note}</p> : null}<p className="mt-1 text-[10px] text-[var(--fg-muted-2)]">{formatDate(event.createdAt)}</p></div></div>
}

function Detail({ label, value, icon: Icon }: { label: string; value: string | null; icon?: typeof UserRound }) {
  return <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0"><dt className="flex items-center gap-1.5 text-[var(--fg-muted-2)]">{Icon ? <Icon className="size-3.5" /> : null}{label}</dt><dd className="break-words capitalize text-[var(--fg-soft)]">{value || 'Not provided'}</dd></div>
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
