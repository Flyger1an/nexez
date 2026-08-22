'use client'

import type { KeyboardEvent } from 'react'
import { Bot, Globe, Target } from 'lucide-react'

const modes = [
  { key: 'test', label: 'Test a listing', icon: Bot },
  { key: 'url', label: 'Any URL', icon: Globe },
  { key: 'compare', label: 'Compare a competitor', icon: Target },
] as const

export type AgentLabMode = (typeof modes)[number]['key']

export function AgentLabModeTabs({
  mode,
  isLoggedIn,
  onChange,
}: {
  mode: AgentLabMode
  isLoggedIn: boolean
  onChange: (mode: AgentLabMode) => void
}) {
  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, currentMode: AgentLabMode) {
    const currentIndex = modes.findIndex((item) => item.key === currentMode)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % modes.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + modes.length) % modes.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = modes.length - 1
    if (nextIndex == null) return

    event.preventDefault()
    const nextMode = modes[nextIndex].key
    onChange(nextMode)
    document.getElementById(`agent-lab-tab-${nextMode}`)?.focus()
  }

  return (
    <div role="tablist" aria-label="Agent Lab modes" className="mb-8 grid gap-2 rounded-2xl border border-[var(--bd-10)] bg-[var(--panel)] p-2 sm:grid-cols-3">
      {modes.map((item) => (
        <button
          key={item.key}
          id={`agent-lab-tab-${item.key}`}
          role="tab"
          aria-selected={mode === item.key}
          aria-controls={`agent-lab-panel-${item.key}`}
          tabIndex={mode === item.key ? 0 : -1}
          onClick={() => onChange(item.key)}
          onKeyDown={(event) => selectFromKeyboard(event, item.key)}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] ${
            mode === item.key
              ? 'border-[var(--signal)] bg-[var(--signal)]/10 text-foreground'
              : 'border-[var(--bd-10)] text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-foreground'
          }`}
        >
          <item.icon className="size-4" aria-hidden="true" /> {item.label}
          {item.key === 'compare' && !isLoggedIn ? <span className="text-[10px] text-zinc-500">(sign in)</span> : null}
        </button>
      ))}
    </div>
  )
}
