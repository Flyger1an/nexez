'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, Users, X } from 'lucide-react'
import { createClient } from '../utils/supabase/client'
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
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('team_invites')
      .insert({ owner_id: user.id, email: email.trim().toLowerCase(), role })
    if (error) setMessage(error.message)
    else {
      setEmail('')
      void load()
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
        <Users className="size-5 text-cyan-200" />
        <h2 className="text-xl font-semibold">Team</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Invite teammates to your workspace. (Invite management is live; shared editing access rolls out next.)
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="w-full rounded-lg border border-white/15 bg-black/30 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
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
          className="rounded-lg border border-[#7C3AED]/40 bg-[#7C3AED]/10 px-4 py-2 text-sm text-[#C4B5FD] hover:bg-[#7C3AED]/20"
        >
          Invite
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-amber-300">{message}</p>}

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : invites.length === 0 ? (
          <p className="text-sm text-zinc-500">No teammates invited yet.</p>
        ) : (
          invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-2 text-sm">
              <div className="min-w-0">
                <span className="truncate text-zinc-200">{inv.email}</span>
                <span className="ml-2 text-[10px] text-zinc-500">
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
