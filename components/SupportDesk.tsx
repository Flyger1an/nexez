'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, CheckCircle2, HelpCircle, Loader2, Send, TicketCheck } from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { appUrl } from '../lib/site'
import type { SupportService } from '../lib/support-routing'

type PageOption = {
  id: string
  name: string
  slug: string
}

type AssistResult = {
  source: string
  confidence: number
  summary: string
  steps: string[]
  escalationHint: string
}

type TicketResult = {
  id: string
  status: string
  persisted: boolean
  message?: string
  supportService?: SupportService
  requestPath?: string
  createdAt?: string
}

type TicketSummary = {
  id: string
  subject: string
  status: 'open' | 'in_review' | 'waiting_on_user' | 'resolved' | 'closed'
  updatedAt: string
}

const STANDARD_SUPPORT: SupportService = {
  planId: 'free',
  tier: 'standard',
  priorityRouting: false,
  upgradePlanId: 'scale',
}
const SUPPORT_PLAN_IDS = new Set(['free', 'launch', 'pro', 'scale', 'enterprise'])

const categories = [
  { value: 'page_setup', label: 'Listing setup' },
  { value: 'agent_visibility', label: 'Agent visibility' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'billing', label: 'Billing' },
  { value: 'transaction', label: 'Refund / order issue' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'general', label: 'General' },
]

export function SupportDesk() {
  const [pages, setPages] = useState<PageOption[]>([])
  const [loadingPages, setLoadingPages] = useState(true)
  const [supportService, setSupportService] = useState<SupportService | null>(null)
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [target, setTarget] = useState('workspace')
  const [category, setCategory] = useState('agent_visibility')
  const [severity, setSeverity] = useState('normal')
  const [subject, setSubject] = useState('')
  const [query, setQuery] = useState('')
  const [reference, setReference] = useState('')
  const [assist, setAssist] = useState<AssistResult | null>(null)
  const [ticket, setTicket] = useState<TicketResult | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'assist' | 'ticket' | null>(null)
  const [signedIn, setSignedIn] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadPages() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!cancelled) {
          setSignedIn(false)
          setLoadingPages(false)
        }
        return
      }

      const [{ data }, supportContext] = await Promise.all([
        supabase
          .from('pages')
          .select('id,name,slug')
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(50)
          .returns<PageOption[]>(),
        loadSupportContext(),
      ])

      if (!cancelled) {
        setPages(data ?? [])
        setSupportService(supportContext.supportService)
        setTickets(supportContext.tickets)
        setLoadingPages(false)
      }
    }

    loadPages()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedPage = useMemo(() => pages.find((page) => page.id === target), [pages, target])
  const targetName = selectedPage?.name || 'Workspace / account'

  async function askAiSupport() {
    setMessage('')
    setTicket(null)
    setAssist(null)

    if (query.trim().length < 8) {
      setMessage('Add a little more detail so AI support can reason about the issue.')
      return
    }

    setBusy('assist')
    try {
      const response = await fetch('/api/support/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category,
          query,
          targetName,
          pageSlug: selectedPage?.slug,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Support AI could not respond.')
      setAssist(json)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Support AI could not respond.')
    } finally {
      setBusy(null)
    }
  }

  async function createTicket() {
    setMessage('')
    setBusy('ticket')
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageId: target,
          targetName,
          subject: subject || inferSubject(query),
          category,
          priority: severity,
          query,
          reference: category === 'transaction' ? reference : '',
          aiResponse: assist ? `${assist.summary}\n\n${assist.steps.join('\n')}` : '',
          metadata: {
            ai_confidence: assist?.confidence,
            ai_source: assist?.source,
          },
        }),
      })
      const json = await response.json()
      if (!response.ok && response.status !== 202) throw new Error(json.error || 'Ticket could not be created.')
      setTicket(json)
      if (isSupportService(json.supportService)) setSupportService(json.supportService)
      if (json.persisted && json.id) {
        setTickets((current) => [{
          id: json.id,
          subject: subject || inferSubject(query),
          status: json.status,
          updatedAt: json.createdAt ?? new Date().toISOString(),
        }, ...current.filter((item) => item.id !== json.id)].slice(0, 20))
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ticket could not be created.')
    } finally {
      setBusy(null)
    }
  }

  if (!signedIn) {
    return (
      <div className="rounded-lg border border-border bg-white/[0.03] p-8 text-center">
        <HelpCircle className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Sign in for support</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Support needs your workspace context so AI can inspect the right pages and tickets are tied to your account.
        </p>
        <a href={appUrl('/login?next=/support')} className="btn-primary mt-5">Sign in</a>
      </div>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.65fr)]">
      <section className="rounded-lg border border-border bg-white/[0.03] p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-border bg-black">
            <HelpCircle className="size-4 text-[var(--signal)]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Tell us what needs help</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Select the workspace or listing first. Nexez AI will try to solve it before a ticket is created.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Project or listing</span>
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="h-11 w-full rounded-md border border-border bg-[var(--fill-1)] px-3 text-sm text-white outline-none focus:border-zinc-500"
            >
              <option value="workspace">Workspace / account</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name} /{page.slug}
                </option>
              ))}
            </select>
            {loadingPages ? <span className="mt-1 block text-xs text-muted-foreground">Loading listings...</span> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Issue area</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 w-full rounded-md border border-border bg-[var(--fill-1)] px-3 text-sm text-white outline-none focus:border-zinc-500"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {category === 'transaction' ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Related order / deal reference</span>
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className="h-11 w-full rounded-md border border-border bg-[var(--fill-1)] px-3 text-sm text-white outline-none placeholder:text-[var(--fg-muted)] focus:border-zinc-500"
                placeholder="Negotiation/order id or Stripe session - helps us trace it"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="h-11 w-full rounded-md border border-border bg-[var(--fill-1)] px-3 text-sm text-white outline-none placeholder:text-[var(--fg-muted)] focus:border-zinc-500"
              placeholder="Short issue title"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Incident severity</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="h-11 w-full rounded-md border border-border bg-[var(--fill-1)] px-3 text-sm text-white outline-none focus:border-zinc-500"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Severity records operational impact. Urgent incident reporting is available on every plan.
            </span>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">What is happening?</span>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-36 w-full rounded-md border border-border bg-[var(--fill-1)] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-[var(--fg-muted)] focus:border-zinc-500"
            placeholder="Example: Claude can open my listing but does not see the booking link for my strategy session."
          />
        </label>

        {message ? <p className="mt-3 rounded-md border border-[var(--amber)]/20 bg-[var(--amber)]/10 px-3 py-2 text-sm text-[var(--amber)]">{message}</p> : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={askAiSupport}
            disabled={busy !== null}
            className="btn-primary min-h-10"
          >
            {busy === 'assist' ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
            Ask AI support
          </button>
          <button
            type="button"
            onClick={createTicket}
            disabled={busy !== null || !query.trim()}
            className="btn-secondary min-h-10"
          >
            {busy === 'ticket' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Create ticket
          </button>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-white/[0.03] p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Support service</p>
          <h3 className="mt-3 text-lg font-semibold">
            {supportService?.priorityRouting ? 'Priority support' : 'Standard support'}
          </h3>
          {loadingPages ? (
            <p className="mt-1 text-sm text-muted-foreground">Checking your current plan...</p>
          ) : supportService?.priorityRouting ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Your current Scale or Enterprise entitlement places tickets in the priority support queue.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Tickets use the standard queue. <a href="/pricing" className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">Upgrade to Scale</a> for priority routing.
            </p>
          )}
        </div>

        {tickets.length ? (
          <div className="rounded-lg border border-border bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Your requests</p>
              <span className="font-mono text-xs text-muted-foreground">{tickets.length}</span>
            </div>
            <div className="mt-3 divide-y divide-border">
              {tickets.slice(0, 5).map((item) => (
                <a
                  key={item.id}
                  href={appUrl(`/support/requests/${item.id}`)}
                  className="flex items-center justify-between gap-3 py-3 text-sm transition first:pt-0 last:pb-0 hover:text-[var(--signal)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.subject}</span>
                    <span className="mt-1 block text-xs capitalize text-muted-foreground">{supportStatusLabel(item.status)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">Open</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-white/[0.03] p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Selected context</p>
          <h3 className="mt-3 text-lg font-semibold">{targetName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedPage ? `Public slug: /${selectedPage.slug}` : 'Account, billing, integrations, or cross-listing issue.'}
          </p>
        </div>

        {assist ? (
          <div className="rounded-lg border border-border bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--signal)]">AI support answer</p>
              <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {assist.confidence}% confidence
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-200">{assist.summary}</p>
            <div className="mt-4 space-y-2">
              {assist.steps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-md border border-border bg-black/30 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-mono text-xs text-white">{index + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">{assist.escalationHint}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTicket({ id: 'resolved', status: 'resolved', persisted: false, message: 'Marked as solved by AI support.' })}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--ready)]/25 bg-[var(--ready)]/10 px-3 text-sm text-[var(--ready)]"
              >
                <CheckCircle2 className="size-4" />
                This helped
              </button>
              <button
                type="button"
                onClick={createTicket}
                disabled={busy !== null}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-white hover:bg-white/[0.06]"
              >
                <TicketCheck className="size-4" />
                Still need help
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">
            Ask AI support first. If the answer misses, create a ticket with the selected listing, category, question, and AI attempt attached.
          </div>
        )}

        {ticket ? (
          <div className="rounded-lg border border-[var(--ready)]/25 bg-[var(--ready)]/10 p-5">
            <div className="flex items-center gap-2 text-[var(--ready)]">
              <TicketCheck className="size-4" />
              <p className="font-medium">{ticket.status === 'resolved' ? 'Solved by AI support' : 'Ticket created'}</p>
            </div>
            <p className="mt-2 font-mono text-xs text-[var(--ready)]/80">{ticket.id}</p>
            {ticket.status !== 'resolved' && ticket.supportService ? (
              <p className="mt-2 text-xs leading-5 text-[var(--ready)]/80">
                Submitted to {ticket.supportService.priorityRouting ? 'priority support' : 'standard support'}.
              </p>
            ) : null}
            {ticket.message ? <p className="mt-2 text-xs leading-5 text-[var(--ready)]/80">{ticket.message}</p> : null}
            {ticket.requestPath ? (
              <a href={appUrl(ticket.requestPath)} className="mt-3 inline-flex text-sm font-medium text-[var(--ready)] underline underline-offset-4">
                Track this request
              </a>
            ) : null}
            {!ticket.persisted && ticket.id !== 'resolved' ? (
              <p className="mt-2 text-xs leading-5 text-[var(--ready)]/80">
                Review mode: this will persist after the support_tickets migration is applied.
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function inferSubject(query: string) {
  const first = query.trim().split(/[.\n]/)[0]?.trim()
  if (!first) return 'Support request'
  return first.length > 72 ? `${first.slice(0, 69)}...` : first
}

async function loadSupportContext(): Promise<{ supportService: SupportService; tickets: TicketSummary[] }> {
  try {
    const response = await fetch('/api/support/tickets', { cache: 'no-store' })
    if (!response.ok) return { supportService: STANDARD_SUPPORT, tickets: [] }
    const body = await response.json() as { supportService?: unknown; tickets?: unknown }
    return {
      supportService: isSupportService(body.supportService) ? body.supportService : STANDARD_SUPPORT,
      tickets: Array.isArray(body.tickets)
        ? body.tickets.filter(isTicketSummary)
        : [],
    }
  } catch {
    return { supportService: STANDARD_SUPPORT, tickets: [] }
  }
}

function isSupportService(value: unknown): value is SupportService {
  if (!value || typeof value !== 'object') return false
  const service = value as Partial<SupportService>
  return (service.tier === 'standard' || service.tier === 'priority')
    && typeof service.planId === 'string'
    && SUPPORT_PLAN_IDS.has(service.planId)
    && typeof service.priorityRouting === 'boolean'
    && (service.upgradePlanId === 'scale' || service.upgradePlanId === null)
    && service.priorityRouting === (service.tier === 'priority')
    && service.upgradePlanId === (service.priorityRouting ? null : 'scale')
}

function isTicketSummary(value: unknown): value is TicketSummary {
  if (!value || typeof value !== 'object') return false
  const ticket = value as Partial<TicketSummary>
  return typeof ticket.id === 'string'
    && typeof ticket.subject === 'string'
    && typeof ticket.updatedAt === 'string'
    && ['open', 'in_review', 'waiting_on_user', 'resolved', 'closed'].includes(ticket.status ?? '')
}

function supportStatusLabel(status: TicketSummary['status']) {
  if (status === 'waiting_on_user') return 'Waiting on you'
  return status.replaceAll('_', ' ')
}
