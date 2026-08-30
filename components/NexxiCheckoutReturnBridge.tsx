'use client'

import { useEffect } from 'react'

export function NexxiCheckoutReturnBridge({ deepLink }: { deepLink: string }) {
  useEffect(() => {
    window.location.replace(deepLink)
  }, [deepLink])

  return (
    <a
      href={deepLink}
      className="inline-flex rounded-lg bg-[var(--signal)] px-5 py-3 text-sm font-semibold text-zinc-950 hover:opacity-90"
    >
      Return to Nexxi
    </a>
  )
}
