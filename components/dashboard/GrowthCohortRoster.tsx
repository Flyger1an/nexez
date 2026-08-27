'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  FileCheck2,
  Loader2,
  Mail,
  Rocket,
  ShieldCheck,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react'
import { parseGrowthCohortCsv } from '../../lib/growth-cohort-csv'
import type {
  GrowthCohortBatchSummary,
  GrowthCohortMember,
  GrowthCohortReleaseSummary,
  GrowthCohortRolloutState,
  GrowthCohortStatus,
  GrowthCohortVerificationStatus,
  GrowthControlSnapshot,
} from '../../lib/growth-control'

const STATUS_LABEL: Record<GrowthCohortStatus, string> = {
  pending: 'Pending',
  claimed: 'Joined',
  qualified: 'Launch active',
  expired: 'Expired',
  revoked: 'Revoked',
}

const VERIFICATION_LABEL: Record<GrowthCohortVerificationStatus, string> = {
  unverified: 'Unverified',
  valid: 'Verified',
  risky: 'Risky',
  invalid: 'Invalid',
  unknown: 'Unknown',
}

const ROLLOUT_LABEL: Record<GrowthCohortRolloutState, string> = {
  legacy: 'Legacy',
  staged: 'Staged',
  ready: 'Ready',
  releasing: 'Sending',
  sent: 'Sent',
  failed: 'Retry ready',
  suppressed: 'Blocked',
}

type MutationResponse = {
  snapshot?: GrowthControlSnapshot
  summary?: GrowthCohortBatchSummary | GrowthCohortReleaseSummary
  member?: GrowthCohortMember
  error?: string
}

function canRevoke(member: GrowthCohortMember): boolean {
  return member.status === 'pending' || member.status === 'claimed' || member.status === 'expired'
}

function verificationStyle(status: GrowthCohortVerificationStatus): string {
  if (status === 'valid') return 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]'
  if (status === 'risky' || status === 'unknown') return 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'
  if (status === 'invalid') return 'border-red-400/30 bg-red-400/10 text-red-300'
  return 'border-border bg-white/[0.04] text-[var(--fg-muted)]'
}

export function GrowthCohortRoster({
  snapshot,
  onSnapshot,
}: {
  snapshot: GrowthControlSnapshot
  onSnapshot: (snapshot: GrowthControlSnapshot) => void
}) {
  const campaign = snapshot.campaign
  const [csv, setCsv] = useState('')
  const [waveSize, setWaveSize] = useState(20)
  const [defaultProvider, setDefaultProvider] = useState('millionverifier')
  const [stageReason, setStageReason] = useState('')
  const [releaseReason, setReleaseReason] = useState('')
  const [memberReason, setMemberReason] = useState('')
  const [releaseWave, setReleaseWave] = useState(1)
  const [releaseLimit, setReleaseLimit] = useState(20)
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const preview = useMemo(
    () => parseGrowthCohortCsv(csv, { waveSize, defaultProvider }),
    [csv, defaultProvider, waveSize],
  )
  const previewCounts = useMemo(() => preview.candidates.reduce((counts, candidate) => {
    counts[candidate.verificationStatus] += 1
    return counts
  }, { unverified: 0, valid: 0, risky: 0, invalid: 0, unknown: 0 }), [preview.candidates])
  const waveOptions = useMemo(() => {
    const waves = new Set(snapshot.cohortMembers.map((member) => member.wave).filter((wave): wave is number => Boolean(wave)))
    return Array.from(waves).sort((left, right) => left - right)
  }, [snapshot.cohortMembers])
  const selectedWave = waveOptions.includes(releaseWave) ? releaseWave : waveOptions[0] ?? 1
  const eligibleInWave = snapshot.cohortMembers.filter((member) => (
    member.wave === selectedWave
    && member.status === 'pending'
    && member.verificationStatus === 'valid'
    && (
      (member.rolloutState === 'ready' || member.rolloutState === 'failed')
      || member.rolloutState === 'releasing'
    )
    && member.rolloutAttempts <= 3
  )).length

  if (!campaign) return null
  const campaignId = campaign.id
  const disabled = campaign.status === 'ended'
  const expectedConfirmation = `RELEASE WAVE ${selectedWave}`

  async function request(body: Record<string, unknown>): Promise<MutationResponse> {
    const response = await fetch('/api/admin/growth-campaign', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campaignId,
        idempotencyKey: crypto.randomUUID(),
        ...body,
      }),
    })
    const result = await response.json().catch(() => ({})) as MutationResponse
    if (!response.ok || !result.snapshot) {
      throw new Error(result.error || 'The cohort change could not be saved.')
    }
    return result
  }

  async function stageBatch() {
    if (loading) return
    if (stageReason.trim().length < 3) {
      setFeedback({ tone: 'error', text: 'Add a short operational reason before staging the batch.' })
      return
    }
    if (!preview.candidates.length || preview.errors.length) {
      setFeedback({ tone: 'error', text: 'Resolve the CSV preview errors before staging candidates.' })
      return
    }
    setLoading('stage')
    setFeedback(null)
    try {
      const result = await request({
        action: 'cohort_stage_batch',
        reason: stageReason.trim(),
        candidates: preview.candidates,
      })
      onSnapshot(result.snapshot as GrowthControlSnapshot)
      const summary = result.summary as GrowthCohortBatchSummary
      setFeedback({
        tone: 'success',
        text: `${summary.stagedCount} candidate${summary.stagedCount === 1 ? '' : 's'} staged, ${summary.updatedCount} refreshed, ${summary.duplicateCount} protected from overwrite. No email was sent.`,
      })
      setCsv('')
      setStageReason('')
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'The batch could not be staged.' })
    } finally {
      setLoading('')
    }
  }

  async function releaseWaveBatch() {
    if (loading) return
    if (releaseReason.trim().length < 3) {
      setFeedback({ tone: 'error', text: 'Add a short operational reason before releasing a wave.' })
      return
    }
    if (confirmation !== expectedConfirmation) {
      setFeedback({ tone: 'error', text: `Type ${expectedConfirmation} to confirm this bounded release.` })
      return
    }
    setLoading('release')
    setFeedback(null)
    try {
      const result = await request({
        action: 'cohort_release_wave',
        reason: releaseReason.trim(),
        wave: selectedWave,
        limit: releaseLimit,
        confirmation,
      })
      onSnapshot(result.snapshot as GrowthControlSnapshot)
      const summary = result.summary as GrowthCohortReleaseSummary
      setFeedback({
        tone: summary.failed ? 'error' : 'success',
        text: `${summary.sent} of ${summary.selected} selected candidate${summary.selected === 1 ? '' : 's'} sent from wave ${summary.wave}. ${summary.failed} failed and remain recoverable.`,
      })
      setConfirmation('')
      setReleaseReason('')
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'The wave could not be released.' })
    } finally {
      setLoading('')
    }
  }

  async function revokeMember(member: GrowthCohortMember) {
    if (loading) return
    if (memberReason.trim().length < 3) {
      setFeedback({ tone: 'error', text: 'Add a roster action reason before revoking a candidate.' })
      return
    }
    setLoading(`revoke:${member.id}`)
    setFeedback(null)
    try {
      const result = await request({
        action: 'cohort_revoke',
        reason: memberReason.trim(),
        memberId: member.id,
      })
      onSnapshot(result.snapshot as GrowthControlSnapshot)
      setMemberReason('')
      setFeedback({ tone: 'success', text: `Cohort access for ${member.email} was revoked.` })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'The cohort seat could not be revoked.' })
    } finally {
      setLoading('')
    }
  }

  const metrics = snapshot.metrics

  return (
    <div className="space-y-5 pt-5">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--ready)]/25 bg-[var(--ready)]/[0.06] px-4 py-3 text-xs leading-5 text-[var(--ready)]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Staging never sends email. Automated release accepts only verified-valid candidates, sends at most 25, and requires an exact wave confirmation.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <CohortMetric icon={Users} label="Candidates" value={metrics.cohortTotal} />
        <CohortMetric icon={FileCheck2} label="Verified valid" value={metrics.cohortVerifiedValid} />
        <CohortMetric icon={Rocket} label="Ready" value={metrics.cohortReady + metrics.cohortDeliveryFailed} />
        <CohortMetric icon={Mail} label="Delivered" value={metrics.cohortDelivered} />
        <CohortMetric icon={UserCheck} label="Launch active" value={metrics.cohortQualified} />
      </div>

      {feedback ? (
        <div role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-xs leading-5 ${feedback.tone === 'error' ? 'border-red-400/30 bg-red-400/[0.08] text-red-300' : 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.07] text-[var(--ready)]'}`}>
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-[var(--signal)]" />
            <h3 className="text-sm font-medium">1. Stage candidate CSV</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">
            Accepts Apollo or MillionVerifier exports. Recommended columns: email, company, wave, verification_status, verification_provider. Missing waves are assigned in groups below.
          </p>

          <textarea
            aria-label="Candidate CSV"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={8}
            disabled={disabled}
            placeholder={'email,company,verification_status,verification_provider\nowner@example.com,Example Co,valid,millionverifier'}
            className="mt-4 w-full resize-y rounded-md border border-border bg-black/25 px-3 py-2 font-mono text-xs outline-none transition placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]/60 disabled:opacity-50"
          />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--fg-soft)]">
              Default verifier
              <select value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-black/25 px-3 text-sm">
                <option value="millionverifier">MillionVerifier</option>
                <option value="apollo">Apollo</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--fg-soft)]">
              Automatic wave size
              <input type="number" min={1} max={25} value={waveSize} onChange={(event) => setWaveSize(Math.max(1, Math.min(25, Number(event.target.value) || 1)))} className="mt-2 h-10 w-full rounded-md border border-border bg-black/25 px-3 text-sm" />
            </label>
          </div>

          <div className="mt-3 rounded-md border border-border bg-black/20 p-3 text-[11px] leading-5 text-[var(--fg-muted)]">
            <p>{preview.candidates.length} unique candidate{preview.candidates.length === 1 ? '' : 's'} parsed: {previewCounts.valid} valid, {previewCounts.risky} risky, {previewCounts.invalid} invalid, {previewCounts.unknown + previewCounts.unverified} unknown or unverified.</p>
            {preview.duplicateEmails.length ? <p className="text-[var(--amber)]">{preview.duplicateEmails.length} duplicate email{preview.duplicateEmails.length === 1 ? '' : 's'} removed from this preview.</p> : null}
            {preview.errors.slice(0, 4).map((error) => <p key={error} className="text-red-300">{error}</p>)}
          </div>

          <label className="mt-3 block text-xs font-medium text-[var(--fg-soft)]">
            Staging reason
            <textarea value={stageReason} onChange={(event) => setStageReason(event.target.value)} maxLength={500} rows={2} placeholder="Why is this candidate set entering the cohort?" className="mt-2 w-full resize-y rounded-md border border-border bg-black/25 px-3 py-2 text-sm" />
          </label>
          <button type="button" onClick={stageBatch} disabled={Boolean(loading) || disabled || !preview.candidates.length || Boolean(preview.errors.length)} className="btn-primary mt-4 h-10 w-full px-3 text-sm disabled:opacity-60">
            {loading === 'stage' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Stage {preview.candidates.length || 0} without sending
          </button>
        </section>

        <section className="rounded-lg border border-border bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <Rocket className="size-4 text-[var(--signal)]" />
            <h3 className="text-sm font-medium">2. Release one bounded wave</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">
            The database selects only valid, ready candidates. Risky, invalid, unknown, unverified, previously sent, or max-attempt rows cannot enter the send claim.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--fg-soft)]">
              Wave
              <select value={selectedWave} onChange={(event) => { setReleaseWave(Number(event.target.value)); setConfirmation('') }} className="mt-2 h-10 w-full rounded-md border border-border bg-black/25 px-3 text-sm">
                {(waveOptions.length ? waveOptions : [1]).map((wave) => <option key={wave} value={wave}>Wave {wave}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--fg-soft)]">
              Send cap (maximum 25)
              <input type="number" min={1} max={25} value={releaseLimit} onChange={(event) => setReleaseLimit(Math.max(1, Math.min(25, Number(event.target.value) || 1)))} className="mt-2 h-10 w-full rounded-md border border-border bg-black/25 px-3 text-sm" />
            </label>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--amber)]/25 bg-[var(--amber)]/[0.06] p-3 text-xs leading-5 text-[var(--amber)]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Wave {selectedWave} currently has {eligibleInWave} releaseable or recoverable candidate{eligibleInWave === 1 ? '' : 's'}. This action selects at most {releaseLimit}.
          </div>

          <label className="mt-3 block text-xs font-medium text-[var(--fg-soft)]">
            Release reason
            <textarea value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} maxLength={500} rows={2} placeholder="Why is this wave ready to send now?" className="mt-2 w-full resize-y rounded-md border border-border bg-black/25 px-3 py-2 text-sm" />
          </label>
          <label className="mt-3 block text-xs font-medium text-[var(--fg-soft)]">
            Type <span className="font-mono text-[var(--amber)]">{expectedConfirmation}</span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 h-10 w-full rounded-md border border-border bg-black/25 px-3 font-mono text-sm" />
          </label>
          <button type="button" onClick={releaseWaveBatch} disabled={Boolean(loading) || disabled || confirmation !== expectedConfirmation || eligibleInWave === 0} className="btn-primary mt-4 h-10 w-full px-3 text-sm disabled:opacity-60">
            {loading === 'release' ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Release up to {releaseLimit} from wave {selectedWave}
          </button>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-medium">Cohort roster</h3>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Private operator view. Verification and delivery state never enter public storefront artifacts.</p>
          </div>
          <label className="w-full max-w-xs text-xs font-medium text-[var(--fg-soft)]">
            Roster action reason
            <input value={memberReason} onChange={(event) => setMemberReason(event.target.value)} maxLength={500} placeholder="Required before revoke" className="mt-2 h-9 w-full rounded-md border border-border bg-black/25 px-3 text-xs" />
          </label>
        </div>

        {snapshot.cohortMembers.length ? (
          <div className="divide-y divide-border">
            {snapshot.cohortMembers.map((member) => (
              <div key={member.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--fg-soft)]">{member.label || member.email}</p>
                    <span className="inline-flex min-h-6 items-center rounded-full border border-border bg-white/[0.04] px-2 text-[10px] text-[var(--fg-muted)]">Wave {member.wave || '?'}</span>
                    <span className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[10px] font-medium ${verificationStyle(member.verificationStatus)}`}>{VERIFICATION_LABEL[member.verificationStatus]}</span>
                    <span className="inline-flex min-h-6 items-center rounded-full border border-[var(--signal)]/25 bg-[var(--signal)]/[0.07] px-2 text-[10px] text-[var(--signal)]">{ROLLOUT_LABEL[member.rolloutState]}</span>
                    <span className="inline-flex min-h-6 items-center rounded-full border border-border px-2 text-[10px] text-[var(--fg-muted)]">{STATUS_LABEL[member.status]}</span>
                  </div>
                  {member.label ? <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{member.email}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--fg-muted-2)]">
                    <span>{member.verificationProvider || 'No verifier recorded'}</span>
                    <span>{member.rolloutAttempts} send attempt{member.rolloutAttempts === 1 ? '' : 's'}</span>
                    {member.rolloutLastError ? <span className="text-red-300">{member.rolloutLastError}</span> : null}
                  </div>
                </div>
                {canRevoke(member) ? (
                  <button type="button" onClick={() => revokeMember(member)} disabled={Boolean(loading) || disabled} title={`Revoke invitation for ${member.email}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-red-400/30 px-3 text-xs font-medium text-red-300 transition hover:bg-red-400/10 disabled:opacity-60">
                    {loading === `revoke:${member.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                    Revoke
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 items-center gap-3 px-4 text-xs leading-5 text-[var(--fg-muted)]">
            <Users className="size-4 shrink-0" /> No businesses are staged. Paste the reviewed candidate CSV above to begin.
          </div>
        )}
      </section>
    </div>
  )
}

function CohortMetric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--signal)]"><Icon className="size-4" /> {label}</div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value.toLocaleString()}</p>
    </div>
  )
}
