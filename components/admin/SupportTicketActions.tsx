'use client'

import { useActionState } from 'react'
import { Send } from 'lucide-react'
import type { SupportStatus } from '../../lib/server/support-operations'
import {
  type SupportActionState,
  updateSupportTicketAction,
} from '../../app/admin/support/actions'

const STATUS_OPTIONS: Array<{ value: SupportStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const INITIAL_STATE: SupportActionState = { ok: false, message: '' }

export function SupportTicketActions({ ticketId, status }: { ticketId: string; status: SupportStatus }) {
  const action = updateSupportTicketAction.bind(null, ticketId)
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Request status</span>
        <select
          name="status"
          defaultValue={status}
          className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-[var(--signal)]"
        >
          {status === 'waiting_on_user' ? <option value="waiting_on_user">Waiting on requester (reply sent)</option> : null}
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Operator note</span>
        <textarea
          name="note"
          rows={5}
          maxLength={2_000}
          placeholder="Record what you checked, sent, or decided."
          className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)]"
        />
      </label>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-[var(--ready)]' : 'text-red-300'}`} role="status">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--signal)] px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
      >
        <Send className="size-4" /> {pending ? 'Saving...' : 'Save update'}
      </button>
    </form>
  )
}
