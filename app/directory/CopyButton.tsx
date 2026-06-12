'use client'

/**
 * Tiny Client Component for clipboard copy buttons.
 * Fixes the "Event handlers cannot be passed to Client Component props" / Server Component onClick error
 * that was occurring in the /directory Server Component (navigator.clipboard + onClick are client-only).
 *
 * Used only for the Agent API copy links in the public directory sidebar.
 * Keeps the rest of the directory page as a pure Server Component (important for performance + agent crawlability).
 */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text)}
      className="text-[10px] text-[var(--signal)] hover:text-[var(--signal)] active:text-[var(--signal)]"
    >
      {label}
    </button>
  )
}
