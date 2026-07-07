'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, Users, X } from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { EmptyState } from './EmptyState'
import { TEAM_ROLES, TeamRole, isValidEmail, roleLabel } from '../lib/team'

type Invite = { id: string; email: string; role: TeamRole; status: string; created_at: string }

export function TeamInvites() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>('editor')
  const [message, setMessage] = useState('')

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
    setInvites(error ? [] : data || [])
    setLoading(false)
  }

  async function invite() {
    if (!isValidEmail(email)) {
      setMessage('Enter a valid email.')
      return
    }
    setMessage('')
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
        setMessage(data.error || 'Could not send the invite.')
        return
      }
      setEmail('')
      setMessage(
        data.alreadyInvited
          ? `${to} is already invited.`
          : data.emailed
            ? `Invite sent to ${to}.`
            : `Invite created for ${to}, but we couldn’t send the email - share the workspace link directly.`,
      )
      void load()
    } catch {
      setMessage('Could not send the invite - try again.')
    }
  }

  async function revoke(id: string) {
    const supabase = createClient()
    await supabase.from('team_invites').update({ status: 'revoked' }).eq('id', id)
    void load()
  }

  return (
    <section className="card !p-5">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-[var(--signal)]" />
        <h2 className="text-xl font-semibold">Team</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        Invite teammates by email - they get role-based access to your listings and negotiations. We email them a link to
        join; they sign in with that same email to get access.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted-2)]" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="w-full rounded-lg border border-[var(--bd-15)] bg-[var(--panel)]/70 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          className="rounded-lg border border-[var(--bd-15)] bg-[var(--panel)]/70 px-3 py-2 text-sm text-white"
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
          className="rounded-lg border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-4 py-2 text-sm text-[var(--signal)] hover:bg-[var(--signal)]/20"
        >
          Invite
        </button>
      </div>
      {message && (
        <p className={`mt-2 text-xs ${message.startsWith('Invite sent') || message.includes('already invited') ? 'text-[var(--ready)]' : 'text-[var(--amber)]'}`}>{message}</p>
      )}

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : invites.length === 0 ? (
          <EmptyState icon={Users} title="No teammates yet">
            Invite collaborators to help manage your listings and negotiations - they get scoped, role-based access without
            sharing your login.
          </EmptyState>
        ) : (
          invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-[var(--bd-10)] bg-[var(--panel)]/50 p-2 text-sm">
              <div className="min-w-0">
                <span className="truncate text-zinc-200">{inv.email}</span>
                <span className="ml-2 text-[10px] text-[var(--fg-muted-2)]">
                  {inv.role} · {inv.status}
                </span>
              </div>
              {inv.status !== 'revoked' && (
                <button
                  type="button"
                  onClick={() => revoke(inv.id)}
                  className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
                >
                  <X className="size-3" /> Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
