'use client'

import { useActionState } from 'react'
import { UserRoundCheck } from 'lucide-react'
import {
  assignSupportTicketAction,
  type SupportActionState,
} from '../../app/admin/support/actions'
import type { AdminSupportOperator } from '../../lib/server/support-operations'

const INITIAL_STATE: SupportActionState = { ok: false, message: '' }

export function SupportAssignmentActions({
  ticketId,
  assignedTo,
  operators,
}: {
  ticketId: string
  assignedTo: string | null
  operators: AdminSupportOperator[]
}) {
  const action = assignSupportTicketAction.bind(null, ticketId)
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Assigned operator</span>
        <select
          name="assignedTo"
          defaultValue={assignedTo ?? ''}
          className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-[var(--signal)]"
        >
          <option value="">Unassigned</option>
          {operators.map((operator) => (
            <option key={operator.id} value={operator.id}>{operator.label}</option>
          ))}
        </select>
      </label>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-[var(--ready)]' : 'text-red-300'}`} role="status">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-60"
      >
        <UserRoundCheck className="size-4" /> {pending ? 'Assigning...' : 'Save assignment'}
      </button>
    </form>
  )
}
