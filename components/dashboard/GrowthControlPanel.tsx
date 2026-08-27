'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gift,
  History,
  LockKeyhole,
  Loader2,
  MailCheck,
  Pause,
  Play,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  StopCircle,
  TrendingUp,
  Users,
} from 'lucide-react'
import type {
  GrowthAdminAction,
  GrowthCampaignStatus,
  GrowthControlAction,
  GrowthControlSnapshot,
} from '../../lib/growth-control'
import { relativeAge } from '../../lib/launch-control'
import { GrowthCohortRoster } from './GrowthCohortRoster'

type Tab = 'overview' | 'funnel' | 'scan' | 'cohort' | 'activity' | 'controls'

const STATUS_STYLE: Record<GrowthCampaignStatus, string> = {
  draft: 'border-border bg-white/[0.04] text-[var(--fg-muted)]',
  active: 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
  paused: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
  ended: 'border-red-400/30 bg-red-400/10 text-red-300',
}

const ACTION_LABEL: Record<GrowthAdminAction, string> = {
  pause: 'Campaign paused',
  resume: 'Campaign resumed',
  end: 'Campaign ended',
  set_capacity: 'Campaign capacity updated',
  set_signup_close: 'Signup window updated',
  set_enrollment_mode: 'Enrollment mode updated',
  cohort_add: 'Cohort member added',
  cohort_resend: 'Cohort invitation renewed',
  cohort_revoke: 'Cohort invitation revoked',
  cohort_stage_batch: 'Cohort batch staged',
  cohort_release_wave: 'Cohort wave released',
}

function formatDate(value: string | null): string {
  if (!value) return 'Open until paused or ended'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)))
}

export function GrowthControlPanel({ initialSnapshot }: { initialSnapshot: GrowthControlSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [tab, setTab] = useState<Tab>('overview')
  const [reason, setReason] = useState('')
  const [capacity, setCapacity] = useState(String(initialSnapshot.campaign?.maxGrants ?? 1_000))
  const [signupClose, setSignupClose] = useState(toDateTimeLocal(initialSnapshot.campaign?.signupClosesAt ?? null))
  const [saving, setSaving] = useState<GrowthControlAction | ''>('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const campaign = snapshot.campaign
  const metrics = snapshot.metrics
  const summary = snapshot.summary

  const tabs = useMemo<Array<{ id: Tab; label: string; count?: number }>>(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'funnel', label: 'Activation funnel' },
    { id: 'scan', label: 'Scan funnel', count: snapshot.scanFunnel.metrics.captured },
    { id: 'cohort', label: 'Private cohort', count: snapshot.cohortMembers.length },
    { id: 'activity', label: 'Activity', count: snapshot.recentEvents.length },
    { id: 'controls', label: 'Controls' },
  ], [snapshot.cohortMembers.length, snapshot.recentEvents.length, snapshot.scanFunnel.metrics.captured])

  if (!snapshot.available || !campaign) {
    return (
      <section className="py-8" aria-labelledby="growth-control-heading">
        <SectionIntro status={campaign?.status ?? null} />
        <div className="flex min-h-32 items-start gap-4 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] px-5 py-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--amber)]" />
          <div>
            <p className="text-sm font-medium">
              {campaign ? 'Campaign telemetry is unavailable' : 'No seller growth campaign found'}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">
              {snapshot.warnings[0] || 'Confirm the Growth Control migration and server credentials, then refresh this page.'}
            </p>
          </div>
        </div>
      </section>
    )
  }

  async function applyControl(
    action: GrowthControlAction,
    fields: {
      maxGrants?: number
      signupClosesAt?: string | null
      enrollmentMode?: 'open' | 'invite_only'
    } = {},
  ) {
    if (!campaign || saving) return
    const cleanReason = reason.trim()
    if (cleanReason.length < 3) {
      setFeedback({ tone: 'error', message: 'Add a short operational reason before changing the campaign.' })
      return
    }

    setSaving(action)
    setFeedback(null)
    try {
      const response = await fetch('/api/admin/growth-campaign', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.id,
          action,
          reason: cleanReason,
          idempotencyKey: crypto.randomUUID(),
          ...fields,
        }),
      })
      const body = await response.json().catch(() => ({})) as {
        snapshot?: GrowthControlSnapshot
        error?: string
      }
      if (!response.ok || !body.snapshot) {
        throw new Error(body.error || 'The campaign control could not be saved.')
      }

      setSnapshot(body.snapshot)
      setCapacity(String(body.snapshot.campaign?.maxGrants ?? capacity))
      setSignupClose(toDateTimeLocal(body.snapshot.campaign?.signupClosesAt ?? null))
      setReason('')
      setConfirmEnd(false)
      setFeedback({ tone: 'success', message: ACTION_LABEL[action] })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The campaign control could not be saved.',
      })
    } finally {
      setSaving('')
    }
  }

  const statusAction = campaign.status === 'active'
    ? { action: 'pause' as const, label: 'Pause campaign', Icon: Pause }
    : campaign.status === 'paused'
      ? { action: 'resume' as const, label: 'Resume campaign', Icon: Play }
      : null

  return (
    <section className="py-8" aria-labelledby="growth-control-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionIntro status={campaign.status} />
        <div className="flex items-center gap-2">
          <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-white/[0.03] px-3 text-xs font-medium">
            {campaign.enrollmentMode === 'invite_only' ? 'Invite-only' : 'Open enrollment'}
          </span>
          <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium capitalize ${STATUS_STYLE[campaign.status]}`}>
            {campaign.status}
          </span>
          <span className="text-xs text-[var(--fg-muted-2)]">
            Updated {relativeAge(campaign.updatedAt, snapshot.generatedAt)}
          </span>
        </div>
      </div>

      {snapshot.warnings.length ? (
        <div className="mt-4 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] px-4 py-3 text-xs leading-5 text-[var(--amber)]">
          {snapshot.warnings.join(' ')}
        </div>
      ) : null}

      <div className="platform-tablist mt-5" role="tablist" aria-label="Growth Control views">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className="platform-tab !text-xs"
          >
            {entry.label}
            {entry.count ? <span className="font-mono text-[10px] text-[var(--fg-muted-2)]">{entry.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="pt-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={Gift}
              label="Active Launch grants"
              value={metrics.grantsActive}
              detail={`${metrics.grantsTotal} issued across the campaign`}
              tone="ready"
            />
            <Metric
              icon={Users}
              label="Remaining capacity"
              value={summary.capacityRemaining}
              detail={`${summary.capacityPercent}% of ${campaign.maxGrants.toLocaleString()} used`}
              tone={summary.capacityPercent >= 90 ? 'warning' : 'signal'}
            />
            <Metric
              icon={TrendingUp}
              label="Referral activations"
              value={metrics.referralGrants}
              detail={`${metrics.welcomeGrants} direct activations`}
              tone="signal"
            />
            <Metric
              icon={CheckCircle2}
              label="Paid conversions"
              value={metrics.paidConversions}
              detail={`${summary.paidConversionRate}% of issued grants`}
              tone={metrics.paidConversions ? 'ready' : 'muted'}
            />
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-border bg-white/[0.025]">
            <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
              <Fact label="Grant" value={`${campaign.grantDurationDays} days of ${campaign.grantPlanId}`} />
              <Fact label="Business passes" value={`${campaign.inviteSlots} per activated business`} />
              <Fact label="Pass expiry" value={`${campaign.inviteExpiresDays} days`} />
              <Fact label="Signup window" value={formatDate(campaign.signupClosesAt)} />
              <Fact label="Enrollment" value={campaign.enrollmentMode === 'invite_only' ? 'Invite-only cohort' : 'Open qualification'} />
            </div>
            <div className="border-t border-border px-4 py-4">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-[var(--fg-muted)]">Campaign capacity</span>
                <span className="font-mono text-[var(--fg-soft)]">
                  {metrics.grantsTotal.toLocaleString()} / {campaign.maxGrants.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[var(--signal)] transition-[width]"
                  style={{ width: `${summary.capacityPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'funnel' ? (
        <div className="grid gap-5 pt-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
          <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium">Invitation progression</h3>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">Seller referral passes moving from delivery to verified activation.</p>
            </div>
            <div className="space-y-4 p-4">
              <FunnelRow label="Created" value={metrics.invitesTotal} total={metrics.invitesTotal} />
              <FunnelRow label="Delivered" value={metrics.invitesDelivered} total={metrics.invitesTotal} />
              <FunnelRow
                label="Claimed"
                value={metrics.invitesClaimed + metrics.invitesQualified}
                total={metrics.invitesTotal}
              />
              <FunnelRow label="Launch activated" value={metrics.invitesQualified} total={metrics.invitesTotal} />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium">Lifecycle health</h3>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">Campaign outcomes that need operational attention.</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border">
              <Fact label="Pending passes" value={String(metrics.invitesPending)} />
              <Fact label="Undelivered" value={String(metrics.invitesUndelivered)} />
              <Fact label="Expired passes" value={String(metrics.invitesExpired)} />
              <Fact label="Revoked passes" value={String(metrics.invitesRevoked)} />
              <Fact label="Expiry notices" value={String(metrics.noticesSent)} />
              <Fact label="Free fallbacks" value={String(metrics.fallbackApplied)} />
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'scan' ? (
        <ScanFunnelView snapshot={snapshot} />
      ) : null}

      {tab === 'cohort' ? (
        <GrowthCohortRoster snapshot={snapshot} onSnapshot={setSnapshot} />
      ) : null}

      {tab === 'activity' ? (
        <div className="grid gap-5 pt-5 xl:grid-cols-2">
          <ActivityList
            title="Campaign activity"
            empty="No activation or invitation activity has been recorded yet."
            rows={snapshot.recentEvents.map((event) => ({
              id: event.id,
              title: event.label,
              detail: event.detail,
              timestamp: event.createdAt,
            }))}
            generatedAt={snapshot.generatedAt}
          />
          <ActivityList
            title="Operator audit"
            empty="No operator has changed this campaign."
            rows={snapshot.adminEvents.map((event) => ({
              id: event.id,
              title: ACTION_LABEL[event.action],
              detail: event.reason,
              timestamp: event.createdAt,
            }))}
            generatedAt={snapshot.generatedAt}
          />
        </div>
      ) : null}

      {tab === 'controls' ? (
        <div className="pt-5">
          {feedback ? (
            <p
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              className={`mb-4 rounded-lg border px-4 py-3 text-xs leading-5 ${
                feedback.tone === 'error'
                  ? 'border-red-400/30 bg-red-400/[0.08] text-red-300'
                  : 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.07] text-[var(--ready)]'
              }`}
            >
              {feedback.message}
            </p>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-lg border border-border bg-white/[0.025] p-4">
              <label htmlFor="growth-control-reason" className="text-sm font-medium">Operational reason</label>
              <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">
                Required for every change and retained in the append-only operator audit.
              </p>
              <textarea
                id="growth-control-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Why is this campaign change needed?"
                className="mt-3 w-full resize-y rounded-md border border-border bg-black/25 px-3 py-2 text-sm outline-none transition placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {statusAction ? (
                  <button
                    type="button"
                    onClick={() => applyControl(statusAction.action)}
                    disabled={Boolean(saving)}
                    className="btn-secondary min-h-10 px-3 text-sm disabled:opacity-60"
                  >
                    {saving === statusAction.action
                      ? <Loader2 className="size-4 animate-spin" />
                      : <statusAction.Icon className="size-4" />}
                    {statusAction.label}
                  </button>
                ) : null}
                {campaign.status === 'ended' ? (
                  <span className="inline-flex min-h-10 items-center gap-2 text-xs text-red-300">
                    <StopCircle className="size-4" /> This campaign is permanently ended.
                  </span>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
              <ControlRow
                icon={LockKeyhole}
                title="Enrollment access"
                detail="Invite-only blocks direct welcome grants. Secure cohort and seller referral links remain eligible."
              >
                <div className="inline-flex h-10 overflow-hidden rounded-md border border-border bg-black/25 p-1" role="group" aria-label="Campaign enrollment mode">
                  <button
                    type="button"
                    onClick={() => applyControl('set_enrollment_mode', { enrollmentMode: 'open' })}
                    disabled={Boolean(saving) || campaign.status === 'ended' || campaign.enrollmentMode === 'open'}
                    className={`min-w-20 rounded px-3 text-xs font-medium transition disabled:opacity-50 ${
                      campaign.enrollmentMode === 'open' ? 'bg-white/10 text-foreground' : 'text-[var(--fg-muted)] hover:text-foreground'
                    }`}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => applyControl('set_enrollment_mode', { enrollmentMode: 'invite_only' })}
                    disabled={Boolean(saving) || campaign.status === 'ended' || campaign.enrollmentMode === 'invite_only'}
                    className={`min-w-24 rounded px-3 text-xs font-medium transition disabled:opacity-50 ${
                      campaign.enrollmentMode === 'invite_only' ? 'bg-[var(--signal)]/15 text-[var(--signal)]' : 'text-[var(--fg-muted)] hover:text-foreground'
                    }`}
                  >
                    Invite-only
                  </button>
                </div>
                {saving === 'set_enrollment_mode' ? <Loader2 className="size-4 animate-spin text-[var(--signal)]" /> : null}
              </ControlRow>

              <ControlRow
                icon={SlidersHorizontal}
                title="Campaign capacity"
                detail={`Cannot be lower than the ${metrics.grantsTotal.toLocaleString()} grants already issued.`}
              >
                <input
                  type="number"
                  min={Math.max(1, metrics.grantsTotal)}
                  max={100_000}
                  step={25}
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  disabled={campaign.status === 'ended'}
                  aria-label="Maximum campaign grants"
                  className="h-10 w-28 rounded-md border border-border bg-black/25 px-3 text-sm outline-none focus:border-[var(--signal)]/60 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => applyControl('set_capacity', { maxGrants: Number(capacity) })}
                  disabled={Boolean(saving) || campaign.status === 'ended'}
                  className="btn-secondary h-10 px-3 text-sm disabled:opacity-60"
                >
                  {saving === 'set_capacity' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save
                </button>
              </ControlRow>

              <ControlRow
                icon={CalendarClock}
                title="Signup closing date"
                detail="Existing grants retain their fixed end dates after the window closes."
              >
                <input
                  type="datetime-local"
                  value={signupClose}
                  onChange={(event) => setSignupClose(event.target.value)}
                  disabled={campaign.status === 'ended'}
                  aria-label="Campaign signup closing date"
                  className="h-10 min-w-0 rounded-md border border-border bg-black/25 px-3 text-sm outline-none focus:border-[var(--signal)]/60 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => applyControl('set_signup_close', {
                    signupClosesAt: signupClose ? new Date(signupClose).toISOString() : null,
                  })}
                  disabled={Boolean(saving) || campaign.status === 'ended'}
                  className="btn-secondary h-10 px-3 text-sm disabled:opacity-60"
                >
                  {saving === 'set_signup_close' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Update
                </button>
              </ControlRow>

              {campaign.status !== 'ended' ? (
                <ControlRow
                  icon={ShieldAlert}
                  title="End campaign"
                  detail="Stops all new grants and claims. Existing grants continue through their original end date."
                  danger
                >
                  {confirmEnd ? (
                    <>
                      <button
                        type="button"
                        onClick={() => applyControl('end')}
                        disabled={Boolean(saving)}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-red-400/35 bg-red-400/10 px-3 text-sm font-medium text-red-300 transition hover:bg-red-400/15 disabled:opacity-60"
                      >
                        {saving === 'end' ? <Loader2 className="size-4 animate-spin" /> : <StopCircle className="size-4" />}
                        Confirm end
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmEnd(false)}
                        disabled={Boolean(saving)}
                        className="btn-secondary h-10 px-3 text-sm disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmEnd(true)}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-red-400/35 px-3 text-sm font-medium text-red-300 transition hover:bg-red-400/10"
                    >
                      <StopCircle className="size-4" /> End campaign
                    </button>
                  )}
                </ControlRow>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

const SCAN_STAGE_LABEL = {
  captured: 'Captured',
  delivered: 'Delivered',
  onboarding: 'Onboarding opened',
  account: 'Account created',
  published: 'Listing published',
  launch: 'Launch activated',
} as const

function ScanFunnelView({ snapshot }: { snapshot: GrowthControlSnapshot }) {
  const funnel = snapshot.scanFunnel
  const metrics = funnel.metrics
  return (
    <div className="space-y-5 pt-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
        <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium">Scan-to-Launch progression</h3>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Exact milestones stamped from email delivery, onboarding, authenticated accounts, publication, and grants.</p>
          </div>
          <div className="space-y-4 p-4">
            <FunnelRow label="Email captured" value={metrics.captured} total={metrics.captured} />
            <FunnelRow label="Result delivered" value={metrics.delivered} total={metrics.captured} />
            <FunnelRow label="Onboarding opened" value={metrics.onboardingOpened} total={metrics.captured} />
            <FunnelRow label="Account created" value={metrics.accountsCreated} total={metrics.captured} />
            <FunnelRow label="Listing published" value={metrics.published} total={metrics.captured} />
            <FunnelRow label="Launch activated" value={metrics.launchActivated} total={metrics.captured} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium">Delivery health</h3>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Exceptions that need operator attention before another cohort is released.</p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            <Fact label="Pending" value={String(metrics.pendingDelivery)} />
            <Fact label="Pending over 2h" value={String(metrics.stalePending)} />
            <Fact label="Stale claims" value={String(metrics.staleClaims)} />
            <Fact label="Abandoned" value={String(metrics.abandoned)} />
            <Fact label="Abandoned 24h" value={String(metrics.abandoned24h)} />
            <Fact label="Suppressed" value={String(metrics.suppressed)} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-medium">Recent scan leads</h3>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Newest 100 consented scan-result requests, visible only to platform administrators.</p>
          </div>
          <span className="font-mono text-[10px] text-[var(--fg-muted-2)]">{funnel.recentLeads.length} shown</span>
        </div>
        {funnel.recentLeads.length ? (
          <div className="divide-y divide-border">
            {funnel.recentLeads.map((lead) => (
              <div key={lead.id} className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--fg-soft)]" title={lead.email}>{lead.email}</p>
                  <p className="mt-1 truncate text-[var(--fg-muted)]" title={lead.domain}>{lead.domain}</p>
                </div>
                <div className="text-[var(--fg-muted)]">
                  <span className="rounded-full border border-border px-2 py-1 text-[10px] text-[var(--signal)]">{SCAN_STAGE_LABEL[lead.stage]}</span>
                  {lead.lastError ? <p className="mt-1 max-w-64 truncate text-red-300" title={lead.lastError}>{lead.lastError}</p> : null}
                </div>
                <span className="font-mono text-[var(--fg-muted)]">{lead.score ?? 'n/a'}/100</span>
                <span className="text-[10px] text-[var(--fg-muted-2)]">{relativeAge(lead.createdAt, snapshot.generatedAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-28 items-center gap-3 px-4 text-xs text-[var(--fg-muted)]">
            <MailCheck className="size-4" /> No scan-result requests have been captured yet.
          </div>
        )}
      </div>
    </div>
  )
}

function SectionIntro({ status }: { status: GrowthCampaignStatus | null }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
        <Activity className="size-4" /> Seller growth
      </div>
      <h1 id="growth-control-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Growth Control</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">
        Monitor complimentary Launch activation, invitation quality, paid conversion, and Free fallback outcomes.
        {status === 'ended' ? ' This campaign is closed to new participants.' : ''}
      </p>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'muted',
}: {
  icon: typeof Gift
  label: string
  value: number
  detail: string
  tone?: 'ready' | 'signal' | 'warning' | 'muted'
}) {
  const color = tone === 'ready'
    ? 'text-[var(--ready)]'
    : tone === 'signal'
      ? 'text-[var(--signal)]'
      : tone === 'warning'
        ? 'text-[var(--amber)]'
        : 'text-[var(--fg-muted)]'
  return (
    <div className="rounded-lg border border-border bg-white/[0.025] p-4">
      <div className={`flex items-center gap-2 text-xs ${color}`}><Icon className="size-4" /> {label}</div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{detail}</p>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-background/75 px-4 py-3">
      <p className="text-[10px] uppercase text-[var(--fg-muted-2)]">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-[var(--fg-soft)]" title={value}>{value}</p>
    </div>
  )
}

function FunnelRow({ label, value, total }: { label: string; value: number; total: number }) {
  const width = percent(value, total)
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-[var(--fg-soft)]">{label}</span>
        <span className="font-mono text-[var(--fg-muted)]">{value.toLocaleString()} · {width}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-[var(--ready)] transition-[width]" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function ActivityList({
  title,
  empty,
  rows,
  generatedAt,
}: {
  title: string
  empty: string
  rows: Array<{ id: string; title: string; detail: string; timestamp: string }>
  generatedAt: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
        <History className="size-4 text-[var(--signal)]" /> {title}
      </div>
      {rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--fg-soft)]">{row.title}</p>
                <p className="mt-1 truncate text-xs text-[var(--fg-muted)]" title={row.detail}>{row.detail}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] text-[var(--fg-muted-2)]">
                <Clock3 className="size-3" /> {relativeAge(row.timestamp, generatedAt)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-28 items-center gap-3 px-4 text-xs leading-5 text-[var(--fg-muted)]">
          <MailCheck className="size-4 shrink-0" /> {empty}
        </div>
      )}
    </div>
  )
}

function ControlRow({
  icon: Icon,
  title,
  detail,
  danger = false,
  children,
}: {
  icon: typeof SlidersHorizontal
  title: string
  detail: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <div className="grid gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex gap-3">
        <Icon className={`mt-0.5 size-4 shrink-0 ${danger ? 'text-red-300' : 'text-[var(--signal)]'}`} />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-[var(--fg-muted)]">{detail}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
