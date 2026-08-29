'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { THEME_KEY, type ThemeChoice } from '../lib/theme'

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return choice
}

function apply(choice: ThemeChoice) {
  const c = document.documentElement.classList
  c.remove('light', 'dark')
  c.add(resolve(choice))
}

export const THEME_OPTIONS: { id: ThemeChoice; Icon: typeof Sun; label: string }[] = [
  { id: 'light', Icon: Sun, label: 'Light' },
  { id: 'dark', Icon: Moon, label: 'Dark' },
  { id: 'system', Icon: Monitor, label: 'System' },
]

export function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice>('dark')

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as ThemeChoice) || 'dark'
    setChoice(stored)
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (((localStorage.getItem(THEME_KEY) as ThemeChoice) || 'dark') === 'system') apply('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function pick(next: ThemeChoice) {
    setChoice(next)
    localStorage.setItem(THEME_KEY, next)
    apply(next)
  }

  return { choice, pick }
}

// Platform-wide light / dark / system theme switch. Persists to localStorage,
// applies the class on <html>, and reacts to OS changes while in system mode.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { choice, pick } = useThemeChoice()

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-border bg-white/[0.04] p-0.5 ${className}`}
      role="radiogroup"
      aria-label="Color theme"
    >
      {THEME_OPTIONS.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={choice === id}
          aria-label={label}
          title={`${label} theme`}
          onClick={() => pick(id)}
          className={`flex size-7 items-center justify-center rounded-md transition-colors ${
            choice === id ? 'bg-[var(--fill-2)] text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
