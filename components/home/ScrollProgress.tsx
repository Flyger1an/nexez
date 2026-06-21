'use client'

import { useEffect, useState } from 'react'

// A thin periwinkle reading-progress rail pinned to the very top edge of the page.
// Reflects scroll position only (no easing loop), so it's inert under reduced-motion.
export function ScrollProgress() {
  const [p, setP] = useState(0)

  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      setP(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]">
      <div
        className="h-full origin-left"
        style={{
          transform: `scaleX(${p})`,
          background: 'linear-gradient(90deg, color-mix(in srgb, var(--signal) 55%, transparent), var(--signal))',
          boxShadow: '0 0 10px color-mix(in srgb, var(--signal) 55%, transparent)',
          transition: 'transform 80ms linear',
        }}
      />
    </div>
  )
}
