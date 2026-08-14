import Link from 'next/link'
import {
  AlertTriangle,
  BadgeCheck,
  GitCommitHorizontal,
  History,
  ShieldCheck,
  Store,
  TrendingUp,
  UserRoundCheck,
} from 'lucide-react'
import type { AdminAuditEvent, AdminAuditTone, AdminOperator } from '../../../lib/admin-control'
import { relativeAge } from '../../../lib/launch-control'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getAdminGovernanceSnapshot } from '../../../lib/server/admin-governance'

const TONE_STYLE: Record<AdminAuditTone, string> = {
  ready: 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]',
  attention: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
  blocked: 'border-red-400/30 bg-red-400/10 text-red-300',
  neutral: 'border-border bg-white/[0.04] text-[var(--fg-muted)]',
}

const SOURCE_LABEL = {
  growth: 'Growth',
  marketplace: 'Marketplace',
  release: 'Release',
} as const

export default async function AdminAuditPage() {
  await requirePlatformAdmin('/admin/audit')
  const snapshot = await getAdminGovernanceSnapshot()
  const latest = snapshot.events[0]?.createdAt ?? null

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]"><ShieldCheck className="size-4" /> Governance</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Access & audit</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">Platform-admin membership and append-only operational evidence from Growth Control, marketplace curation, and release certification.</p>
          </div>
          <span className="inline-flex min-h-9 w-fit items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 text-xs text-[var(--fg-muted)]"><History className="size-3.5" /> Read-only governance view</span>
        </header>

        {snapshot.warnings.length ? (
          <div className="mt-5 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] px-4 py-3 text-xs leading-5 text-[var(--amber)]" role="status">{snapshot.warnings.join(' ')}</div>
        ) : null}

        <section aria-label="Governance summary" className="grid gap-3 py-6 sm:grid-cols-3">
          <SummaryCard icon={UserRoundCheck} label="Platform admins" value={snapshot.available ? String(snapshot.operators.length) : 'Unavailable'} detail="Service-role membership ledger" />
          <SummaryCard icon={History} label="Audit events loaded" value={String(snapshot.events.length)} detail="Newest 100 across all sources" />
          <SummaryCard icon={BadgeCheck} label="Latest evidence" value={latest ? relativeAge(latest, snapshot.generatedAt) : 'None'} detail="Growth, marketplace, or release" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(300px,.72fr)_minmax(0,1.28fr)]">
          <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
            <div className="border-b border-border px-4 py-4"><h2 className="text-base font-semibold tracking-tight">Platform-admin access</h2><p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Membership is visible here but remains service-role managed; the console cannot self-promote an account.</p></div>
            {snapshot.operators.length ? (
              <div className="divide-y divide-border">
                {snapshot.operators.map((operator) => <OperatorRow key={operator.userId} operator={operator} generatedAt={snapshot.generatedAt} />)}
              </div>
            ) : (
              <div className="flex min-h-36 items-center gap-3 px-4 py-5"><AlertTriangle className="size-5 text-[var(--amber)]" /><div><p className="text-sm font-medium">No operator membership could be displayed</p><p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Check the platform-admin ledger warning above before changing access outside the application.</p></div></div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4"><div><h2 className="text-base font-semibold tracking-tight">Unified operator trail</h2><p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Chronological evidence; corrections are new events, never edits.</p></div><span className="font-mono text-xs text-[var(--fg-muted-2)]">{snapshot.events.length}</span></div>
            {snapshot.events.length ? (
              <div className="divide-y divide-border">
                {snapshot.events.map((event) => <AuditRow key={event.id} event={event} generatedAt={snapshot.generatedAt} />)}
              </div>
            ) : (
              <div className="flex min-h-36 items-center gap-3 px-4 py-5"><History className="size-5 text-[var(--fg-muted)]" /><div><p className="text-sm font-medium">No audit evidence is available</p><p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">No growth, marketplace, or release event was returned by the protected ledgers.</p></div></div>
            )}
          </div>
        </section>

        <footer className="mt-8 border-t border-border pt-5 text-xs text-[var(--fg-muted-2)]">Snapshot generated {new Date(snapshot.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.</footer>
      </div>
    </main>
  )
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: typeof History; label: string; value: string; detail: string }) {
  return <article className="rounded-lg border border-border bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-[var(--fg-muted)]">{label}</span><Icon className="size-4 text-[var(--fg-muted-2)]" /></div><p className="mt-3 font-mono text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-[var(--fg-muted)]">{detail}</p></article>
}

function OperatorRow({ operator, generatedAt }: { operator: AdminOperator; generatedAt: string }) {
  return (
    <article className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]"><ShieldCheck className="size-4" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{operator.email ?? `User ${operator.userId.slice(0, 8)}`}</p><p className="mt-1 break-all font-mono text-[10px] text-[var(--fg-muted-2)]">{operator.userId}</p>{operator.note ? <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">{operator.note}</p> : null}</div>
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-muted-2)]">Granted {relativeAge(operator.createdAt, generatedAt)}</p>
    </article>
  )
}

function AuditRow({ event, generatedAt }: { event: AdminAuditEvent; generatedAt: string }) {
  const Icon = event.source === 'growth' ? TrendingUp : event.source === 'marketplace' ? Store : GitCommitHorizontal
  return (
    <Link href={event.href} className="grid gap-3 px-4 py-4 transition hover:bg-white/[0.04] sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-start">
      <span className="flex size-8 items-center justify-center rounded-md border border-border bg-white/[0.04]"><Icon className="size-4 text-[var(--fg-muted)]" /></span>
      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{event.title}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] ${TONE_STYLE[event.tone]}`}>{SOURCE_LABEL[event.source]}</span></span><span className="mt-1 block text-xs leading-5 text-[var(--fg-muted)]">{event.detail}</span><span className="mt-2 block truncate text-[10px] text-[var(--fg-muted-2)]">{event.actorEmail ?? (event.actorId ? `Actor ${event.actorId}` : 'Automated system')}</span></span>
      <time className="text-[10px] text-[var(--fg-muted-2)]">{relativeAge(event.createdAt, generatedAt)}</time>
    </Link>
  )
}
