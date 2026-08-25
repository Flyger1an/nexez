'use client'

import { useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function SupportRequesterReply({
  ticketId,
  initialMessageId,
  closed,
}: {
  ticketId: string
  initialMessageId: string
  closed: boolean
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [clientMessageId, setClientMessageId] = useState(initialMessageId)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const body = String(formData.get('body') ?? '').trim()
    if (!body) return

    setBusy(true)
    setResult(null)
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, clientMessageId }),
      })
      const payload = await response.json() as { error?: string; notificationStatus?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not send your reply.')

      formRef.current?.reset()
      setClientMessageId(crypto.randomUUID())
      setResult({
        ok: true,
        message: payload.notificationStatus === 'sent'
          ? 'Reply sent to Nexez Support.'
          : 'Reply saved. The team can see it in the support desk.',
      })
      router.refresh()
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Could not send your reply.',
      })
    } finally {
      setBusy(false)
    }
  }

  if (closed) {
    return (
      <div className="rounded-lg border border-border bg-white/[0.025] p-5">
        <p className="text-sm font-medium">This request is closed</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Start a new support request if you still need help.</p>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={submit} className="rounded-lg border border-border bg-white/[0.025] p-5">
      <input type="hidden" name="clientMessageId" value={clientMessageId} />
      <label className="block">
        <span className="text-sm font-semibold">Reply to support</span>
        <textarea
          name="body"
          rows={5}
          maxLength={10_000}
          required
          placeholder="Add an update or answer the support team."
          className="mt-3 w-full resize-y rounded-md border border-border bg-[var(--fill-1)] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-[var(--fg-muted)] focus:border-zinc-500"
        />
      </label>
      {result ? (
        <p className={`mt-3 text-sm ${result.ok ? 'text-[var(--ready)]' : 'text-red-300'}`} role="status">
          {result.message}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn-primary mt-4 min-h-10">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {busy ? 'Sending...' : 'Send reply'}
      </button>
    </form>
  )
}
