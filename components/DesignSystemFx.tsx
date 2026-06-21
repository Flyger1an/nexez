'use client'

import { useEffect } from 'react'

// Liquid Glass motion layer — ported from nexez-fx.js, adapted for React/Next.
// Runs once after mount: cursor-tracked specular on buttons/lift-cards, scroll-reveal
// entrances on .glass/.kpi (with the release-after-1500ms pattern so native hover
// transforms aren't overridden), KPI count-ups, and readiness-ring draw.
//
// Deliberately omitted vs the vanilla script (they fight React's DOM):
//  - the h1 word-stagger (rewrites text nodes),
//  - the cloneNode mobile-nav (built in React per surface during the upgrade).
// Mounted once in the root layout; safe under reduced-motion (entrances skipped,
// specular listener stays for the static cursor light).
export function DesignSystemFx() {
  useEffect(() => {
    const root = document.documentElement
    const observers: IntersectionObserver[] = []

    const onMove = (e: PointerEvent) => {
      const t = (e.target as Element | null)?.closest?.(
        '.btn,.btn-primary,.btn-secondary,.glass.lift',
      ) as HTMLElement | null
      if (!t) return
      const r = t.getBoundingClientRect()
      t.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
      t.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => window.removeEventListener('pointermove', onMove)
    }
    root.classList.add('fx')

    // scroll reveals with gentle stagger; release the classes after entrance.
    // [data-reveal] is the explicit opt-in marker (homepage sections use it so they
    // get the entrance without adopting .glass styling).
    const rvs = Array.from(document.querySelectorAll<HTMLElement>('.glass,.bubble,.kpi,[data-reveal]'))
    rvs.forEach((el) => el.classList.add('rv'))
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return
          const el = en.target as HTMLElement
          el.querySelectorAll<HTMLElement>('.chart .bar').forEach((b, k) => (b.style.transitionDelay = `${k * 45}ms`))
          el.querySelectorAll<HTMLElement>('.share .fill').forEach((b, k) => (b.style.transitionDelay = `${k * 90}ms`))
          el.querySelectorAll<HTMLElement>('.funnel .step').forEach((b, k) => (b.style.transitionDelay = `${k * 120}ms`))
          el.classList.add('inview')
          io.unobserve(el)
          window.setTimeout(() => {
            el.classList.remove('rv', 'inview')
            el.style.transitionDelay = ''
          }, 1500)
        })
      },
      { threshold: 0.16 },
    )
    rvs.forEach((el, k) => {
      el.style.transitionDelay = `${(k % 4) * 70}ms`
      io.observe(el)
    })
    observers.push(io)

    // KPI counters — "$48.2k", "2,847", "19+" parse; "<200ms" is skipped
    document.querySelectorAll<HTMLElement>('.kpi-num').forEach((el) => {
      const m = (el.textContent || '').trim().match(/^(\$?)([\d,]+(?:\.\d+)?)([a-z%+]*)$/i)
      if (!m) return
      const target = parseFloat(m[2].replace(/,/g, ''))
      const dec = (m[2].split('.')[1] || '').length
      const fmt = (v: number) =>
        m[1] + v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3]
      const io2 = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting) return
            io2.disconnect()
            const t0 = performance.now()
            const D = 1300
            const step = (t: number) => {
              const p = Math.min(1, (t - t0) / D)
              const e = 1 - Math.pow(1 - p, 3)
              el.textContent = fmt(target * e)
              if (p < 1) requestAnimationFrame(step)
              else el.textContent = fmt(target)
            }
            requestAnimationFrame(step)
          })
        },
        { threshold: 0.5 },
      )
      io2.observe(el)
      observers.push(io2)
    })

    // readiness rings draw from zero
    document.querySelectorAll<SVGGeometryElement>('.ring .fg').forEach((c) => {
      const target = c.style.strokeDashoffset || c.getAttribute('stroke-dashoffset') || '0'
      c.style.strokeDashoffset = c.getAttribute('stroke-dasharray') || '138'
      const io3 = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting) return
            requestAnimationFrame(() => {
              c.style.strokeDashoffset = target
            })
            io3.disconnect()
          })
        },
        { threshold: 0.4 },
      )
      io3.observe(c)
      observers.push(io3)
    })

    return () => {
      window.removeEventListener('pointermove', onMove)
      observers.forEach((o) => o.disconnect())
    }
  }, [])

  return null
}
