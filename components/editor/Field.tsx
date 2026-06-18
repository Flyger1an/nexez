import React from 'react'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-200">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-[var(--bd-10)] bg-[var(--ov-06)] px-4 py-3 text-[var(--fg)] placeholder:text-[var(--fg-muted-2)] outline-none transition focus:border-[var(--signal)]/60'

export const textareaClass =
  'min-h-28 w-full rounded-lg border border-[var(--bd-10)] bg-[var(--ov-06)] px-4 py-3 text-[var(--fg)] placeholder:text-[var(--fg-muted-2)] outline-none transition focus:border-[var(--signal)]/60'
