import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock3, LifeBuoy, MessageSquareText } from 'lucide-react'
import { SupportRequesterReply } from '../../../../components/SupportRequesterReply'
import { getRequesterSupportTicket } from '../../../../lib/server/requester-support'
import { createClient } from '../../../../utils/supabase/server'

const STATUS_LABEL = {
  open: 'Open',
  in_review: 'In review',
  waiting_on_user: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
} as const

export default async function SupportRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const host = (await headers()).get('host')
  const supabase = createClient(await cookies(), host)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${encodeURIComponent(`/support/requests/${id}`)}`)

  const result = await getRequesterSupportTicket(supabase, user.id, id)
  if (!result) notFound()

  const { ticket, messages } = result

  return (
    <main className="min-h-screen bg-background text-white">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
        <Link href="/support" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-white">
          <ArrowLeft className="size-4" /> Back to support
        </Link>

        <header className="mt-6 border-b border-border pb-7">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-2.5 py-1 text-[var(--signal)]">
              {STATUS_LABEL[ticket.status]}
            </span>
            <span className="rounded-full border border-border px-2.5 py-1 capitalize text-muted-foreground">{ticket.priority}</span>
            <span className="font-mono text-muted-foreground">{ticket.id.slice(0, 8)}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{ticket.subject}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Created {formatDate(ticket.createdAt)} for {ticket.pageName ?? 'your workspace'}.</p>
        </header>

        <section className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <article className="rounded-lg border border-border bg-white/[0.025] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold"><LifeBuoy className="size-4 text-[var(--signal)]" /> Your request</p>
                <time className="text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</time>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-200">{ticket.query}</p>
            </article>

            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-lg border p-5 ${message.authorType === 'operator' ? 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.05]' : 'border-border bg-white/[0.025]'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {message.authorType === 'operator' ? <CheckCircle2 className="size-4 text-[var(--ready)]" /> : <MessageSquareText className="size-4 text-muted-foreground" />}
                    {message.authorType === 'operator' ? 'Nexez Support' : 'You'}
                  </p>
                  <time className="text-xs text-muted-foreground">{formatDate(message.sentAt ?? message.createdAt)}</time>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-200">{message.body}</p>
              </article>
            ))}

            <SupportRequesterReply
              ticketId={ticket.id}
              initialMessageId={randomUUID()}
              closed={ticket.status === 'closed'}
            />
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-white/[0.025] p-5">
              <p className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-muted-foreground" /> Response status</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {ticket.firstRespondedAt
                  ? `First response sent ${formatDate(ticket.firstRespondedAt)}.`
                  : 'Your request is waiting for its first support response.'}
              </p>
            </section>
            <section className="rounded-lg border border-border bg-white/[0.025] p-5 text-sm">
              <p className="font-semibold">Request details</p>
              <dl className="mt-3 divide-y divide-border text-xs">
                <Detail label="Category" value={ticket.category.replaceAll('_', ' ')} />
                <Detail label="Reference" value={ticket.reference} />
                <Detail label="Updated" value={formatDate(ticket.updatedAt)} />
              </dl>
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words capitalize text-zinc-200">{value || 'Not provided'}</dd>
    </div>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
