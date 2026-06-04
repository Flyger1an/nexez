'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

// Small copy-to-clipboard control for the homepage agent-payload preview.
export function CodeCopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-white"
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check className="size-3 text-emerald-300" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : label}
    </button>
  )
}
