'use client'

import { useActionState } from 'react'
import { UserPlus } from 'lucide-react'
import {
  grantPlatformAdminAction,
  type AdminGrantActionState,
} from '../../app/admin/audit/actions'

const INITIAL_STATE: AdminGrantActionState = { ok: false, message: '' }

export function GrantAdminAccess() {
  const [state, formAction, pending] = useActionState(grantPlatformAdminAction, INITIAL_STATE)

  return (
    <form action={formAction} className="border-b border-border px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--signal)]/25 bg-[var(--signal)]/10 text-[var(--signal)]">
          <UserPlus className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-medium">Grant admin access</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">The person must already have a Nexez account. This action is permanent in the audit trail.</p>
        </div>
      </div>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Account email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="operator@nexez.ai"
          className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Reason or responsibility</span>
        <textarea
          name="note"
          rows={3}
          maxLength={500}
          placeholder="Example: Support lead"
          className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]"
        />
      </label>
      {state.message ? (
        <p className={`mt-3 text-xs ${state.ok ? 'text-[var(--ready)]' : 'text-red-300'}`} role="status">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--signal)] px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
      >
        <UserPlus className="size-4" /> {pending ? 'Granting...' : 'Grant access'}
      </button>
    </form>
  )
}
