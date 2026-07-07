'use client'

import { useEffect, useRef, useState } from 'react'

// Types out a code block when it scrolls into view. SSR / no-JS / reduced-motion
// render the full text immediately (so it stays crawlable and copy-safe).
export function TypewriterCode({
  text,
  className,
  durationMs = 1500,
}: {
  text: string
  className?: string
  durationMs?: number
}) {
  const ref = useRef<HTMLPreElement>(null)
  const [shown, setShown] = useState(text)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Clear before the user reaches it (the tile is below the fold, so this
    // pre-scroll frame is off-screen - no visible flash).
    setShown('')

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        io.disconnect()
        setTyping(true)
        const total = text.length
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs)
          setShown(text.slice(0, Math.floor(t * total)))
          if (t < 1) {
            requestAnimationFrame(tick)
          } else {
            setShown(text)
            setTyping(false)
          }
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [text, durationMs])

  return (
    <pre ref={ref} className={className}>
      {shown}
      {typing ? <span className="nx-caret" aria-hidden="true" /> : null}
    </pre>
  )
}
