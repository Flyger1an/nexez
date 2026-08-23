'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, ShieldCheck, Users, X } from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { EmptyState } from './EmptyState'
import { TEAM_ROLES, TeamRole, isValidEmail, roleLabel } from '../lib/team'

type Invite = { id: string; email: string; role: TeamRole; status: string; created_at: string }

export function TeamInvites({ collaborationEnabled = true }: { collaborationEnabled?: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>('editor')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'attention' | 'error'>('attention')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return setLoading(false)
    const { data, error } = await supabase
      .from('team_invites')
      .select('id, email, role, status, created_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .returns<Invite[]>()
    if (error) {
      setLoadFailed(true)
      setMessageTone('error')
      setMessage('Team access could not be loaded. Please retry.')
    } else {
      setLoadFailed(false)
      setInvites(data || [])
    }
    setLoading(false)
  }

  async function invite() {
    if (inviting || !collaborationEnabled) return
    if (!isValidEmail(email)) {
      setMessageTone('error')
      setMessage('Enter a valid email.')
      return
    }
    setMessage('')
    setInviting(true)
    // Server route: inserts under the owner's session (RLS + plan-gate still apply)
    // AND emails the invitee a link to join - a direct client insert sent no
    // notification, so the teammate never knew and collaboration never started.
    try {
      const to = email.trim().toLowerCase()
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: to, role }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadyInvited?: boolean; emailed?: boolean }
      if (!res.ok) {
        setMessageTone('error')
        setMessage(data.error || 'Could not send the invite.')
        return
      }
      setEmail('')
      setMessageTone(data.alreadyInvited || !data.emailed ? 'attention' : 'success')
      setMessage(
        data.alreadyInvited
          ? `${to} is already invited.`
          : data.emailed
            ? `Invite sent to ${to}.`
            : `Invite created for ${to}, but we couldn’t send the email - share the workspace link directly.`,
      )
      void load()
    } catch {
      setMessageTone('error')
      setMessage('Could not send the invite - try again.')
    } finally {
      setInviting(false)
    }
  }

  async function revoke(id: string) {
    await updateInvite(id, { action: 'revoke' }, 'Access revoked.')
    setConfirmRevokeId(null)
  }

  async function updateRole(id: string, nextRole: TeamRole) {
    const previous = invites
    setInvites((current) => current.map((invite) => invite.id === id ? { ...invite, role: nextRole } : invite))
    const ok = await updateInvite(id, { action: 'role', role: nextRole }, `Role updated to ${roleLabel(nextRole)}.`)
    if (!ok) setInvites(previous)
  }

  async function updateInvite(
    id: string,
    update: { action: 'revoke' } | { action: 'role'; role: TeamRole },
    successMessage: string,
  ) {
    setBusyId(id)
    setMessage('')
    try {
      const res = await fetch('/api/team/invite', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...update }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; invite?: Invite }
      if (!res.ok || !data.invite) {
        setMessageTone('error')
        setMessage(data.error || 'Team access could not be updated.')
        return false
      }
      setInvites((current) => current.map((invite) => invite.id === id ? data.invite! : invite))
      setMessageTone('success')
      setMessage(successMessage)
      return true
    } catch {
      setMessageTone('error')
      setMessage('Team access could not be updated. Please retry.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card !p-5 sm:!p-6" aria-labelledby="team-settings-title">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-[var(--signal)]" />
        <h2 id="team-settings-title" className="text-xl font-semibold">Team access</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        {collaborationEnabled
          ? 'Invite teammates by email - editors can update listing content and page-scoped configuration under your plan. Account and storefront administration, transaction decisions, money movement, negotiation lifecycle, and final approvals remain owner-only. We email them a link to join; they sign in with that same email to get access.'
          : 'Collaboration is inactive on this plan. Existing members remain listed so you can revoke retained access.'}
      </p>

      {collaborationEnabled ? <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted-2)]" />
          <label htmlFor="team-invite-email" className="sr-only">Teammate email</label>
          <input
            id="team-invite-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus)]"
          />
        </div>
        <label htmlFor="team-invite-role" className="sr-only">Invite role</label>
        <select
          id="team-invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus)]"
        >
          {TEAM_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={invite}
          disabled={inviting}
          className="min-h-11 rounded-xl border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-5 py-2 text-sm font-medium text-[var(--signal)] outline-none transition hover:bg-[var(--signal)]/20 focus-visible:ring-2 focus-visible:ring-[var(--control-focus)]"
        >
          {inviting ? <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" /> : null}
          {inviting ? 'Inviting…' : 'Invite'}
        </button>
      </div> : null}
      {message && (
        <p
          role={messageTone === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-xs ${messageTone === 'success' ? 'text-[var(--ready)]' : messageTone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--amber)]'}`}
        >
          {message}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : loadFailed ? (
          <div role="status" className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--fg-muted)]">
            Team members and invitations are unavailable. Retry by reloading this page.
          </div>
        ) : invites.length === 0 ? (
          <EmptyState icon={Users} title="No teammates yet">
            Invite collaborators to help edit your listings - they get scoped, role-based access without
            sharing your login.
          </EmptyState>
        ) : (
          invites.map((inv) => {
            const isBusy = busyId === inv.id
            const revoked = inv.status === 'revoked'
            return (
              <div key={inv.id} className="grid gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-3 text-sm lg:grid-cols-[minmax(0,1fr)_200px_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--fg)]">{inv.email}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
                    <ShieldCheck className="size-3.5" aria-hidden="true" /> {inv.status} · invited {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`team-role-${inv.id}`}>Role for {inv.email}</label>
                <select
                  id={`team-role-${inv.id}`}
                  value={inv.role}
                  disabled={revoked || isBusy || !collaborationEnabled}
                  onChange={(event) => void updateRole(inv.id, event.target.value as TeamRole)}
                  className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-xs text-[var(--fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus)] disabled:opacity-50"
                >
                  {TEAM_ROLES.map((teamRole) => <option key={teamRole} value={teamRole}>{roleLabel(teamRole)}</option>)}
                </select>
                {!revoked ? (
                  confirmRevokeId === inv.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setConfirmRevokeId(null)} disabled={isBusy} className="min-h-11 rounded-xl border border-[var(--line)] px-3 text-xs text-[var(--fg-muted)]">Cancel</button>
                      <button type="button" onClick={() => void revoke(inv.id)} disabled={isBusy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 text-xs text-red-200 disabled:opacity-50">
                        {isBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />} Confirm revoke
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmRevokeId(inv.id)} disabled={isBusy} className="min-h-11 rounded-xl border border-[var(--line)] px-3 text-xs text-[var(--fg-muted)] outline-none hover:bg-[var(--fill-2)] focus-visible:ring-2 focus-visible:ring-[var(--control-focus)] disabled:opacity-50">
                      Revoke access
                    </button>
                  )
                ) : <span className="text-right text-xs text-[var(--fg-muted-2)]">Access removed</span>}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
