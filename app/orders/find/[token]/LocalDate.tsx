'use client'

import { useEffect, useState } from 'react'

// Renders a date in the BUYER's locale/timezone. The server (force-dynamic, ~UTC)
// would otherwise format it in the runtime TZ — making an evening order look like the
// next day. SSR emits a deterministic UTC value; the client swaps to local after mount
// (suppressHydrationWarning covers the intentional, harmless mismatch).
export function LocalDate({ iso }: { iso: string }) {
  const [text, setText] = useState(() => new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC' }))
  useEffect(() => {
    setText(new Date(iso).toLocaleDateString())
  }, [iso])
  return <span suppressHydrationWarning>{text}</span>
}
