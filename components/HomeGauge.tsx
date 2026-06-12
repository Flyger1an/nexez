'use client'

import { useEffect, useRef, useState } from 'react'

// Readiness gauge that counts up + draws its ring when scrolled into view.
// SSR / no-JS / reduced-motion render the final value immediately.
export function HomeGauge({ value = 92, label = 'Readiness score' }: { value?: number; label?: string }) {
  const circumference = 264
  const finalOffset = Math.round(circumference * (1 - value / 100))

  const ref = useRef<HTMLDivElement>(null)
  const [display, setDisplay] = useState(value)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        io.disconnect()
        setAnimate(true)
        const start = performance.now()
        const duration = 1500
        setDisplay(0)
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const eased = 1 - Math.pow(1 - t, 3)
          setDisplay(Math.round(eased * value))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value])

  return (
    <div ref={ref} className="flex flex-col items-center">
      <div className="relative size-28">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <defs>
            <linearGradient id="nx-gauge-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--signal)" />
              <stop offset="100%" stopColor="var(--ready)" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#nx-gauge-grad)"
            strokeWidth="7"
            strokeLinecap="round"
            className={animate ? 'nx-gauge-ring' : ''}
            style={{ strokeDashoffset: finalOffset, ['--nx-gauge-off' as string]: String(finalOffset) }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-2xl font-semibold text-white tabular-nums">{display}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
