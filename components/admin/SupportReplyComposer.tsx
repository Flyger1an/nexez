'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { MailCheck, Send } from 'lucide-react'
import {
  sendSupportReplyAction,
  type SupportReplyActionState,
} from '../../app/admin/support/actions'

const INITIAL_STATE: SupportReplyActionState = { ok: false, message: '' }

export function SupportReplyComposer({
  ticketId,
  initialToken,
  disabled,
}: {
  ticketId: string
  initialToken: string
  disabled: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [idempotencyToken, setIdempotencyToken] = useState(initialToken)
  const action = sendSupportReplyAction.bind(null, ticketId)
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  useEffect(() => {
    if (!state.ok || state.completedToken !== idempotencyToken) return
    formRef.current?.reset()
    setIdempotencyToken(crypto.randomUUID())
  }, [idempotencyToken, state.completedToken, state.ok])

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyToken" value={idempotencyToken} />
      <label className="block">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Email reply</span>
        <textarea
          name="body"
          rows={7}
          maxLength={10_000}
          required
          disabled={disabled}
          placeholder="Write the response the requester should receive."
          className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <p className="flex items-start gap-2 text-xs leading-5 text-[var(--fg-muted)]">
        <MailCheck className="mt-0.5 size-3.5 shrink-0" />
        Nexez records the reply as sent only after the email provider accepts it.
      </p>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-[var(--ready)]' : 'text-red-300'}`} role="status">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || disabled}
        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--signal)] px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Send className="size-4" /> {pending ? 'Sending...' : 'Send reply'}
      </button>
    </form>
  )
}
