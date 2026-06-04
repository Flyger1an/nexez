'use client'

import { useEffect, useRef } from 'react'

// Subtle scroll parallax on the hero aurora. We translate the *container*
// (the orbs keep their own CSS float animation inside it), so transforms never
// conflict. Passive listener + rAF throttle; disabled for reduced-motion.
export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const update = () => {
      raf = 0
      // Only the hero region matters; cap so it never drifts far.
      const y = Math.min(window.scrollY, 1200)
      el.style.transform = `translate3d(0, ${y * 0.18}px, 0)`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    el.style.willChange = 'transform'
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={ref} className="nx-backdrop" aria-hidden="true">
      <div className="nx-grid" />
      <div className="nx-orb nx-orb--purple" />
      <div className="nx-orb nx-orb--teal" />
      <div className="nx-orb nx-orb--lavender" />
    </div>
  )
}
