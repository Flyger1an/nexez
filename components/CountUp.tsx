'use client'

import { useEffect, useRef, useState } from 'react'

// Animated number that counts up to `value` when scrolled into view.
// SSR / no-JS / reduced-motion render the final formatted value immediately.
export function CountUp({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  separator = false,
  durationMs = 1400,
  className,
}: {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  separator?: boolean
  durationMs?: number
  className?: string
}) {
  const format = (n: number) => {
    let s = n.toFixed(decimals)
    if (separator) {
      const [int, dec] = s.split('.')
      s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? `.${dec}` : '')
    }
    return `${prefix}${s}${suffix}`
  }

  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(() => format(value))

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        setDisplay(format(0))
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs)
          const eased = 1 - Math.pow(1 - t, 3)
          setDisplay(format(eased * value))
          if (t < 1) requestAnimationFrame(tick)
          else setDisplay(format(value))
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, prefix, suffix, decimals, separator, durationMs])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}
