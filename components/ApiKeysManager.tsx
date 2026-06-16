'use client'

import { useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { EmptyState } from './EmptyState'

type ApiKey = {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [freshKey, setFreshKey] = useState<string | null>(null)
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
    if (!user) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, prefix, last_used_at, revoked_at, created_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .returns<ApiKey[]>()
    if (error) {
      // Table not migrated yet → behave as empty rather than crash.
      setKeys([])
    } else {
      setKeys(data || [])
    }
    setLoading(false)
  }

  async function createKey() {
    setCreating(true)
    setMessage('')
    setFreshKey(null)
    try {
      const res = await fetch('/api/dashboard/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || 'API key' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Could not create key.')
      } else {
        setFreshKey(data.raw)
        setNewName('')
        await load()
      }
    } catch {
      setMessage('Network error creating key.')
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(id: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setMessage(error.message)
    else void load()
  }

  return (
    <div className="card !p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-[var(--signal)]" />
        <h3 className="font-semibold">API Keys</h3>
      </div>
      <p className="mt-1 text-sm text-[#9CA3AF]">
        Manage pages programmatically via the REST API. Authenticate with{' '}
        <code className="bg-black/50 px-1">Authorization: Bearer nxz_live_…</code>. Base:{' '}
        <code className="bg-black/50 px-1">/api/v1/pages</code>.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Key name (e.g. Agency CI)"
          className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={creating}
          onClick={createKey}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-4 text-sm text-[var(--signal)] hover:bg-[var(--signal)]/20 disabled:opacity-50"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Generate key
        </button>
      </div>

      {freshKey && (
        <div className="mt-3 rounded-lg border border-[var(--ready)]/30 bg-[var(--ready)]/10 p-3 text-sm">
          <div className="text-[var(--ready)]">Your new key — copy it now, it won’t be shown again:</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-black/50 px-2 py-1 text-[var(--ready)]">{freshKey}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(freshKey)}
              className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
            >
              <Copy className="size-3" /> Copy
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-[var(--amber)]">{message}</p>}

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" /> Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API keys yet">
            Create a key to let your own agents or back-end call the Nexez API on your behalf — programmatic access to your
            pages, offers, and negotiations.
          </EmptyState>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-zinc-200">{k.name}</span>
                  {k.revoked_at ? (
                    <span className="rounded-full border border-red-300/30 bg-red-300/10 px-2 py-0.5 text-[10px] text-red-200">
                      revoked
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-zinc-500">
                  <code>{k.prefix}…</code> · created {new Date(k.created_at).toLocaleDateString()} ·{' '}
                  {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString()}` : 'never used'}
                </div>
              </div>
              {!k.revoked_at && (
                <button
                  type="button"
                  onClick={() => revokeKey(k.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-white/20 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
                >
                  <Trash2 className="size-3" /> Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-[10px] text-zinc-500">
        Use these keys for page management through the Nexez API. Server API access must be enabled for this workspace.
      </p>
    </div>
  )
}
