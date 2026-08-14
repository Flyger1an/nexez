'use client'

import { useState, type FormEvent } from 'react'
import {
  Ban,
  Check,
  Clipboard,
  Clock3,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react'
import type {
  GrowthCohortAction,
  GrowthCohortMember,
  GrowthCohortStatus,
  GrowthControlSnapshot,
} from '../../lib/growth-control'

const STATUS_LABEL: Record<GrowthCohortStatus, string> = {
  pending: 'Invited',
  claimed: 'Joined',
  qualified: 'Launch active',
  expired: 'Expired',
  revoked: 'Revoked',
}

const STATUS_STYLE: Record<GrowthCohortStatus, string> = {
  pending: 'border-[var(--signal)]/30 bg-[var(--signal)]/10 text-[var(--signal)]',
  claimed: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
  qualified: 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
  expired: 'border-border bg-white/[0.04] text-[var(--fg-muted)]',
  revoked: 'border-red-400/30 bg-red-400/10 text-red-300',
}

type MutationResponse = {
  snapshot?: GrowthControlSnapshot
  member?: GrowthCohortMember
  claimUrl?: string | null
  emailed?: boolean
  error?: string
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}

function canRenew(member: GrowthCohortMember): boolean {
  return member.status === 'pending' || member.status === 'expired' || member.status === 'revoked'
}

function canRevoke(member: GrowthCohortMember): boolean {
  return member.status === 'pending' || member.status === 'claimed' || member.status === 'expired'
}

export function GrowthCohortRoster({
  snapshot,
  onSnapshot,
}: {
  snapshot: GrowthControlSnapshot
  onSnapshot: (snapshot: GrowthControlSnapshot) => void
}) {
  const campaign = snapshot.campaign
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState('')
  const [claimUrl, setClaimUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  if (!campaign) return null
  const campaignId = campaign.id

  async function mutate(action: GrowthCohortAction, member?: GrowthCohortMember) {
    const cleanReason = reason.trim()
    if (cleanReason.length < 3) {
      setFeedback({ tone: 'error', text: 'Add a short operational reason before changing the cohort.' })
      return
    }
    if (action === 'cohort_add' && !email.trim()) {
      setFeedback({ tone: 'error', text: 'Enter the business email receiving this cohort seat.' })
      return
    }

    const key = member ? `${action}:${member.id}` : action
    if (loading) return
    setLoading(key)
    setFeedback(null)
    setClaimUrl(null)
    try {
      const response = await fetch('/api/admin/growth-campaign', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          action,
          reason: cleanReason,
          idempotencyKey: crypto.randomUUID(),
          ...(action === 'cohort_add'
            ? { email: email.trim().toLowerCase(), label: label.trim() || null }
            : { memberId: member?.id }),
        }),
      })
      const body = await response.json().catch(() => ({})) as MutationResponse
      if (!response.ok || !body.snapshot || !body.member) {
        throw new Error(body.error || 'The cohort change could not be saved.')
      }

      onSnapshot(body.snapshot)
      setClaimUrl(body.claimUrl || null)
      setReason('')
      if (action === 'cohort_add') {
        setEmail('')
        setLabel('')
      }
      const text = action === 'cohort_revoke'
        ? `Cohort access for ${body.member.email} was revoked.`
        : body.emailed
          ? `A secure cohort invitation was sent to ${body.member.email}.`
          : `The cohort seat is ready for ${body.member.email}. Copy the secure link below.`
      setFeedback({ tone: 'success', text })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'The cohort change could not be saved.',
      })
    } finally {
      setLoading('')
    }
  }

  async function createMember(event: FormEvent) {
    event.preventDefault()
    await mutate('cohort_add')
  }

  async function copyClaimUrl() {
    if (!claimUrl) return
    try {
      await navigator.clipboard.writeText(claimUrl)
      setFeedback({ tone: 'success', text: 'Secure cohort link copied.' })
    } catch {
      setFeedback({ tone: 'error', text: 'Clipboard access is unavailable. Open the invitation email instead.' })
    }
  }

  const disabled = campaign.status === 'ended'
  const metrics = snapshot.metrics

  return (
    <div className="space-y-5 pt-5">
      {campaign.enrollmentMode === 'open' ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] px-4 py-3 text-xs leading-5 text-[var(--amber)]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          The roster can be prepared now, but verified new businesses can still activate directly until enrollment is changed to invite-only.
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--ready)]/25 bg-[var(--ready)]/[0.06] px-4 py-3 text-xs leading-5 text-[var(--ready)]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          Invite-only enrollment is active. Direct welcome grants are blocked; cohort and seller referral links remain eligible.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CohortMetric icon={Users} label="Cohort seats" value={metrics.cohortTotal} />
        <CohortMetric icon={Mail} label="Delivered" value={metrics.cohortDelivered} />
        <CohortMetric icon={UserCheck} label="Joined" value={metrics.cohortClaimed + metrics.cohortQualified} />
        <CohortMetric icon={Check} label="Launch active" value={metrics.cohortQualified} />
      </div>

      {feedback ? (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-xs leading-5 ${
            feedback.tone === 'error'
              ? 'border-red-400/30 bg-red-400/[0.08] text-red-300'
              : 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.07] text-[var(--ready)]'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {claimUrl ? (
        <div className="grid gap-3 rounded-lg border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--signal)]">Secure onboarding link</p>
            <p className="mt-1 truncate font-mono text-[11px] text-[var(--fg-soft)]">{claimUrl}</p>
          </div>
          <button
            type="button"
            onClick={copyClaimUrl}
            className="btn-secondary h-10 px-3 text-sm"
          >
            <Clipboard className="size-4" /> Copy
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,.7fr)_minmax(0,1.3fr)]">
        <form onSubmit={createMember} className="rounded-lg border border-border bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <Send className="size-4 text-[var(--signal)]" />
            <h3 className="text-sm font-medium">Add a business</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">
            The secure link is bound to this email. The business must claim it, publish, and verify before Launch activates.
          </p>

          <label htmlFor="cohort-business-email" className="mt-4 block text-xs font-medium text-[var(--fg-soft)]">
            Business email
          </label>
          <input
            id="cohort-business-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            disabled={disabled}
            placeholder="owner@business.com"
            className="mt-2 h-10 w-full rounded-md border border-border bg-black/25 px-3 text-sm outline-none transition placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60 disabled:opacity-50"
          />

          <label htmlFor="cohort-business-label" className="mt-4 block text-xs font-medium text-[var(--fg-soft)]">
            Business label <span className="font-normal text-[var(--fg-muted-2)]">Optional</span>
          </label>
          <input
            id="cohort-business-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
            disabled={disabled}
            placeholder="Business or contact name"
            className="mt-2 h-10 w-full rounded-md border border-border bg-black/25 px-3 text-sm outline-none transition placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60 disabled:opacity-50"
          />

          <label htmlFor="cohort-operational-reason" className="mt-4 block text-xs font-medium text-[var(--fg-soft)]">
            Operational reason
          </label>
          <textarea
            id="cohort-operational-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            disabled={disabled}
            placeholder="Why is this business entering the cohort?"
            className="mt-2 w-full resize-y rounded-md border border-border bg-black/25 px-3 py-2 text-sm outline-none transition placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={Boolean(loading) || disabled}
            className="btn-primary mt-4 h-10 w-full px-3 text-sm disabled:opacity-60"
          >
            {loading === 'cohort_add' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Create secure invitation
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-medium">Cohort roster</h3>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">Private operator view. Recipient data never enters public storefront artifacts.</p>
            </div>
            <span className="font-mono text-xs text-[var(--fg-muted-2)]">
              {snapshot.cohortMembers.length} member{snapshot.cohortMembers.length === 1 ? '' : 's'}
            </span>
          </div>

          {snapshot.cohortMembers.length ? (
            <div className="divide-y divide-border">
              {snapshot.cohortMembers.map((member) => (
                <div key={member.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-[var(--fg-soft)]">
                        {member.label || member.email}
                      </p>
                      <span className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[10px] font-medium ${STATUS_STYLE[member.status]}`}>
                        {STATUS_LABEL[member.status]}
                      </span>
                    </div>
                    {member.label ? <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{member.email}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--fg-muted-2)]">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" /> Expires {formatDate(member.expiresAt)}
                      </span>
                      <span>{member.deliveryCount ? `${member.deliveryCount} email delivery attempt${member.deliveryCount === 1 ? '' : 's'}` : 'Secure link only'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canRenew(member) ? (
                      <button
                        type="button"
                        onClick={() => mutate('cohort_resend', member)}
                        disabled={Boolean(loading) || disabled}
                        title={`Renew invitation for ${member.email}`}
                        className="btn-secondary h-9 px-3 text-xs disabled:opacity-60"
                      >
                        {loading === `cohort_resend:${member.id}`
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <RefreshCw className="size-3.5" />}
                        Renew
                      </button>
                    ) : null}
                    {canRevoke(member) ? (
                      <button
                        type="button"
                        onClick={() => mutate('cohort_revoke', member)}
                        disabled={Boolean(loading) || disabled}
                        title={`Revoke invitation for ${member.email}`}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-red-400/30 px-3 text-xs font-medium text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
                      >
                        {loading === `cohort_revoke:${member.id}`
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <Ban className="size-3.5" />}
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-40 items-center gap-3 px-4 text-xs leading-5 text-[var(--fg-muted)]">
              <Users className="size-4 shrink-0" />
              No businesses are in this cohort. Add the first verified-business candidate from the form.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CohortMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: number
}) {
  return (
    <div className="rounded-lg border border-border bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--signal)]">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value.toLocaleString()}</p>
    </div>
  )
}
