import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  History,
  Mail,
  MailWarning,
  MessageSquareText,
  UserRound,
} from 'lucide-react'
import { SupportAssignmentActions } from '../../../../components/admin/SupportAssignmentActions'
import { SupportReplyComposer } from '../../../../components/admin/SupportReplyComposer'
import { SupportTicketActions } from '../../../../components/admin/SupportTicketActions'
import { requirePlatformAdmin } from '../../../../lib/server/admin-access'
import {
  getAdminSupportOperators,
  getAdminSupportTicket,
  type AdminSupportEvent,
  type AdminSupportMessage,
  type AdminSupportTicket,
} from '../../../../lib/server/support-operations'

type TimelineEntry =
  | { kind: 'request'; createdAt: string }
  | { kind: 'message'; createdAt: string; message: AdminSupportMessage }
  | { kind: 'event'; createdAt: string; event: AdminSupportEvent }

const MESSAGE_EVENT_TYPES = new Set(['reply_sent', 'reply_failed', 'requester_replied'])

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePlatformAdmin(`/admin/support/${id}`)
  const [result, operators] = await Promise.all([
    getAdminSupportTicket(id),
    getAdminSupportOperators(),
  ])
  if (!result) notFound()

  const { ticket, events, messages } = result
  const operatorLabels = new Map(operators.map((operator) => [operator.id, operator.label]))
  const timeline: TimelineEntry[] = [
    { kind: 'request' as const, createdAt: ticket.createdAt },
    ...messages.map((message) => ({ kind: 'message' as const, createdAt: message.createdAt, message })),
    ...events
      .filter((event) => !MESSAGE_EVENT_TYPES.has(event.eventType))
      .map((event) => ({ kind: 'event' as const, createdAt: event.createdAt, event })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Link href="/admin/support" className="inline-flex items-center gap-2 text-xs text-[var(--fg-muted)] transition hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to support desk
        </Link>
        <header className="mt-5 flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-border bg-white/[0.04] px-2 py-1 capitalize">{ticket.status.replaceAll('_', ' ')}</span>
              <span className="rounded-full border border-border px-2 py-1 capitalize">{ticket.priority}</span>
              <span className="font-mono text-[var(--fg-muted-2)]">{ticket.id}</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{ticket.subject}</h1>
            <p className="mt-3 text-sm text-[var(--fg-muted)]">Received {formatDate(ticket.createdAt)} from {ticket.requesterEmail ?? 'an unknown requester'}.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <EvidenceBadge
              ready={Boolean(ticket.assignedTo)}
              readyLabel={`Assigned to ${operatorLabels.get(ticket.assignedTo ?? '') ?? 'an operator'}`}
              waitingLabel="Unassigned"
            />
            <EvidenceBadge
              ready={Boolean(ticket.firstRespondedAt)}
              readyLabel={`First response ${formatElapsed(ticket.createdAt, ticket.firstRespondedAt)}`}
              waitingLabel="Awaiting first response"
            />
          </div>
        </header>

        <section className="grid gap-5 py-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <div className="space-y-5">
            <article className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
              <div className="border-b border-border px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-[var(--fg-muted)]" /> Conversation and activity</h2>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">Messages and operator actions stay in one dated record.</p>
              </div>
              <div className="divide-y divide-border">
                {timeline.map((entry, index) => {
                  if (entry.kind === 'request') {
                    return <RequestRow key={`request-${entry.createdAt}`} ticket={ticket} />
                  }
                  if (entry.kind === 'message') {
                    return (
                      <MessageRow
                        key={entry.message.id}
                        message={entry.message}
                        requesterEmail={ticket.requesterEmail}
                        operatorLabel={entry.message.authorId ? operatorLabels.get(entry.message.authorId) : null}
                      />
                    )
                  }
                  return <EventRow key={`${entry.event.id}-${index}`} event={entry.event} operators={operatorLabels} />
                })}
              </div>
            </article>

            <article className="rounded-lg border border-border bg-white/[0.025] p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4 text-[var(--signal)]" /> Reply to requester</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">
                The reply is saved before sending. Failed delivery stays visible and does not move the request to waiting.
              </p>
              <div className="mt-5">
                {ticket.requesterEmail ? (
                  <SupportReplyComposer ticketId={ticket.id} initialToken={randomUUID()} disabled={ticket.status === 'closed'} />
                ) : (
                  <p className="rounded-md border border-red-400/30 bg-red-400/[0.05] px-3 py-2 text-sm text-red-300">Requester email is unavailable, so email replies are disabled.</p>
                )}
              </div>
            </article>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-border bg-white/[0.025] p-5">
              <h2 className="text-sm font-semibold">Assignment</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Ownership changes are added to the activity record.</p>
              <div className="mt-5"><SupportAssignmentActions ticketId={ticket.id} assignedTo={ticket.assignedTo} operators={operators} /></div>
            </section>
            <section className="rounded-lg border border-border bg-white/[0.025] p-5">
              <h2 className="text-sm font-semibold">Update request</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Status changes and internal notes are visible only to operators.</p>
              <div className="mt-5"><SupportTicketActions ticketId={ticket.id} status={ticket.status} /></div>
            </section>
            <section className="rounded-lg border border-border bg-white/[0.025] p-5">
              <h2 className="text-sm font-semibold">Request details</h2>
              <dl className="mt-4 divide-y divide-border text-xs">
                <Detail label="Requester" value={ticket.requesterEmail} icon={UserRound} preserveCase />
                <Detail label="Target" value={ticket.pageName ?? 'Workspace'} preserveCase />
                <Detail label="Category" value={ticket.category.replaceAll('_', ' ')} />
                <Detail label="Support level" value={ticket.supportTier ?? 'standard'} />
                <Detail label="Reference" value={ticket.reference} preserveCase />
                <Detail label="First response" value={ticket.firstRespondedAt ? formatDate(ticket.firstRespondedAt) : null} preserveCase />
              </dl>
            </section>
            <section className={`rounded-lg border p-5 ${ticket.notificationStatus === 'sent' ? 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.05]' : 'border-red-400/30 bg-red-400/[0.05]'}`}>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {ticket.notificationStatus === 'sent' ? <Mail className="size-4 text-[var(--ready)]" /> : <MailWarning className="size-4 text-red-300" />} Inbox delivery
              </h2>
              <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">
                {ticket.notificationStatus === 'sent'
                  ? `Initial request sent to support@nexez.ai${ticket.notifiedAt ? ` on ${formatDate(ticket.notifiedAt)}` : ''}.`
                  : 'The initial inbox alert needs review. The request remains safely stored here.'}
              </p>
              {ticket.notificationEmailId ? <p className="mt-3 break-all font-mono text-[10px] text-[var(--fg-muted-2)]">{ticket.notificationEmailId}</p> : null}
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}

function RequestRow({ ticket }: { ticket: AdminSupportTicket }) {
  return (
    <div className="flex gap-3 px-5 py-5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--signal)]/25 bg-[var(--signal)]/10"><MessageSquareText className="size-4 text-[var(--signal)]" /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Request from {ticket.requesterEmail ?? 'requester'}</p>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--fg-soft)]">{ticket.query}</p>
        {ticket.aiResponse ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">Answer shown before escalation</p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[var(--fg-muted)]">{ticket.aiResponse}</p>
          </div>
        ) : null}
        <p className="mt-2 text-[10px] text-[var(--fg-muted-2)]">{formatDate(ticket.createdAt)}</p>
      </div>
    </div>
  )
}

function MessageRow({
  message,
  requesterEmail,
  operatorLabel,
}: {
  message: AdminSupportMessage
  requesterEmail: string | null
  operatorLabel?: string | null
}) {
  const operator = message.authorType === 'operator'
  const deliveryLabel = message.deliveryStatus === 'sent'
    ? 'Provider accepted'
    : message.deliveryStatus === 'failed'
      ? 'Delivery failed'
      : message.deliveryStatus === 'pending'
        ? 'Pending provider'
        : null
  return (
    <div className="flex gap-3 px-5 py-5">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border ${operator ? 'border-[var(--ready)]/25 bg-[var(--ready)]/10' : 'border-border bg-white/[0.04]'}`}>
        {operator ? <CheckCircle2 className="size-4 text-[var(--ready)]" /> : <UserRound className="size-4 text-[var(--fg-muted)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{operator ? operatorLabel ?? 'Nexez operator' : requesterEmail ?? 'Requester'}</p>
          {deliveryLabel ? (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${message.deliveryStatus === 'sent' ? 'border-[var(--ready)]/25 text-[var(--ready)]' : message.deliveryStatus === 'failed' ? 'border-red-400/30 text-red-300' : 'border-[var(--amber)]/25 text-[var(--amber)]'}`}>{deliveryLabel}</span>
          ) : null}
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--fg-soft)]">{message.body}</p>
        {message.deliveryError ? <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-red-300"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{message.deliveryError}</p> : null}
        <p className="mt-2 text-[10px] text-[var(--fg-muted-2)]">{formatDate(message.sentAt ?? message.createdAt)}</p>
      </div>
    </div>
  )
}

function EventRow({ event, operators }: { event: AdminSupportEvent; operators: Map<string, string> }) {
  return (
    <div className="flex gap-3 px-5 py-4">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-white/[0.04]">
        {event.eventType.startsWith('email_') ? <Mail className="size-3.5 text-[var(--fg-muted)]" /> : <Clock3 className="size-3.5 text-[var(--fg-muted)]" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{eventTitle(event, operators)}</p>
        {event.note ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--fg-muted)]">{event.note}</p> : null}
        <p className="mt-1 text-[10px] text-[var(--fg-muted-2)]">{formatDate(event.createdAt)}</p>
      </div>
    </div>
  )
}

function eventTitle(event: AdminSupportEvent, operators: Map<string, string>) {
  if (event.eventType === 'assignment_changed') {
    const assigneeId = typeof event.metadata.assignee_id === 'string' ? event.metadata.assignee_id : null
    return assigneeId ? `Assigned to ${operators.get(assigneeId) ?? 'an operator'}` : 'Request unassigned'
  }
  if (event.eventType === 'email_sent') {
    return event.metadata.kind === 'requester_reply' ? 'Requester reply alert sent' : 'Inbox notification sent'
  }
  if (event.eventType === 'email_failed') {
    return event.metadata.kind === 'requester_reply' ? 'Requester reply alert failed' : 'Inbox notification failed'
  }
  if (event.eventType === 'status_changed') return `Status changed to ${(event.toStatus ?? '').replaceAll('_', ' ')}`
  if (event.eventType === 'note_added') return 'Internal note added'
  return event.eventType.replaceAll('_', ' ')
}

function EvidenceBadge({ ready, readyLabel, waitingLabel }: { ready: boolean; readyLabel: string; waitingLabel: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${ready ? 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]' : 'border-[var(--amber)]/25 bg-[var(--amber)]/10 text-[var(--amber)]'}`}>
      {ready ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}
      {ready ? readyLabel : waitingLabel}
    </span>
  )
}

function Detail({ label, value, icon: Icon, preserveCase = false }: { label: string; value: string | null; icon?: typeof UserRound; preserveCase?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
      <dt className="flex items-center gap-1.5 text-[var(--fg-muted-2)]">{Icon ? <Icon className="size-3.5" /> : null}{label}</dt>
      <dd className={`break-words text-[var(--fg-soft)] ${preserveCase ? '' : 'capitalize'}`}>{value || 'Not provided'}</dd>
    </div>
  )
}

function formatElapsed(start: string, end: string | null) {
  if (!end) return 'not recorded'
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
  if (minutes < 60) return `in ${minutes}m`
  return `in ${Math.round(minutes / 60)}h`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
