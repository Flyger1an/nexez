'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Signature hero interaction: two full-bleed layers of the SAME business page
 * ("Nexez Spa") stacked — a cluttered, ambiguous HUMAN view (warm paper) and a
 * brutally clean AGENT view (dark machine layer). A draggable vertical scanner
 * reveals human on its left, agent on its right. The panel is a fixed "device":
 * its inner colors do NOT flip with the site theme (the paper-vs-machine contrast
 * is the point). The periwinkle accent uses var(--signal) so it stays on-brand.
 */
export function AgentXray() {
  const [reveal, setReveal] = useState(50) // 3..97 — scanner position (% from left)
  const [moved, setMoved] = useState(false)
  const draggingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const setFromClientX = useCallback((clientX: number) => {
    const el = panelRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const p = Math.max(3, Math.min(97, ((clientX - r.left) / r.width) * 100))
    setReveal(p)
    setMoved(true)
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return
      setFromClientX(e.clientX)
    }
    const up = () => {
      draggingRef.current = false
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [setFromClientX])

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    setFromClientX(e.clientX)
  }

  const humanClip = `inset(0 ${(100 - reveal).toFixed(2)}% 0 0)`
  const agentClip = `inset(0 0 0 ${reveal.toFixed(2)}%)`

  return (
    <div className="relative">
      {/* instrument labels */}
      <div className="mb-2.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em]">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-[2px]" style={{ background: '#F3EFE6' }} />
          Human view · what people see
        </span>
        <span className="flex items-center gap-2 text-[var(--signal)]">
          Agent view · what machines read
          <span className="size-2 rounded-[2px]" style={{ background: 'var(--signal)' }} />
        </span>
      </div>

      <div
        ref={panelRef}
        className="relative h-[420px] select-none overflow-hidden rounded-[18px] border border-border sm:h-[472px]"
        style={{ boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)' }}
      >
        {/* ===== HUMAN LAYER (paper) ===== */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ background: '#F3EFE6', color: '#16150F', padding: '30px 34px', clipPath: humanClip }}
        >
          {/* promo strip */}
          <div
            className="mb-3 flex items-center justify-between text-[10.5px]"
            style={{ margin: '-30px -34px 12px', background: '#16150F', color: '#F3EFE6', padding: '6px 34px' }}
          >
            <span>
              ▸ SUMMER SALE — up to <b style={{ color: '#E7B14B' }}>40% off</b> select packages this week only*
            </span>
            <span className="flex gap-3.5" style={{ color: '#A79F8E' }}>
              <span>Gift cards</span>
              <span>📍 2 locations</span>
              <span>☎ (512) 555-0142</span>
            </span>
          </div>
          {/* busy top nav */}
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="flex size-[22px] items-center justify-center rounded-md font-display text-[13px] font-bold"
                style={{ background: '#16150F', color: '#F3EFE6' }}
              >
                N
              </div>
              <span className="font-display text-[15px] font-bold">Nexez Spa &amp; Wellness Co.</span>
            </div>
            <div className="flex items-center gap-3 text-[11.5px]" style={{ color: '#6A6760' }}>
              <span>Services ▾</span>
              <span>Packages ▾</span>
              <span>Therapists</span>
              <span className="hidden lg:inline">Memberships</span>
              <span className="hidden lg:inline">Gift Cards</span>
              <span className="hidden lg:inline">Blog</span>
              <span>About</span>
              <span>🔍</span>
              <span className="rounded-md px-2.5 py-[5px]" style={{ border: '1px solid #C9C2B0' }}>
                Login
              </span>
              <span className="rounded-md px-3 py-[5px] font-semibold" style={{ background: '#16150F', color: '#F3EFE6' }}>
                Book now
              </span>
            </div>
          </div>
          {/* category chips */}
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {['Massage', 'Facials', 'Sauna & Cold Plunge', 'Couples', 'Corporate'].map((c) => (
              <span
                key={c}
                className="rounded-full px-2.5 py-[3px] text-[10.5px]"
                style={{ color: '#56534B', background: '#EAE4D6', border: '1px solid #DED7C6' }}
              >
                {c}
              </span>
            ))}
            <span className="rounded-full px-2.5 py-[3px] text-[10.5px] text-white" style={{ background: '#C24E3A' }}>
              New! IV Therapy
            </span>
          </div>
          {/* hero */}
          <div className="mb-1.5 font-display text-[30px] font-extrabold leading-[1.02] tracking-[-0.03em]">
            Your sanctuary in the city.
          </div>
          <div className="mb-1.5 max-w-[520px] text-[12.5px]" style={{ color: '#56534B' }}>
            Award-winning therapists, same-day appointments, and a menu of rituals designed to help you feel human
            again. Walk-ins welcome — ask about our loyalty perks!
          </div>
          <div className="mb-3 flex gap-2">
            <span className="rounded-md px-3 py-1.5 text-[11px]" style={{ background: '#16150F', color: '#F3EFE6' }}>
              Explore services
            </span>
            <span className="rounded-md px-3 py-1.5 text-[11px]" style={{ border: '1px solid #C9C2B0', color: '#16150F' }}>
              ▶ Watch our story
            </span>
            <span className="px-1 py-1.5 text-[11px]" style={{ color: '#C24E3A' }}>
              See this month&apos;s specials →
            </span>
          </div>
          {/* ambiguous services grid */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              ['Deep Tissue', '60 / 90 min · from $120*'],
              ['Recovery + Sauna', '90 min reset · $180'],
              ['Swedish Classic', 'starting at $99+'],
              ['Hot Stone Ritual', 'call for pricing'],
              ['Couples Escape', 'pricing varies · enquire'],
              ['Memberships', 'see plans & perks'],
            ].map(([name, sub]) => (
              <div key={name} className="rounded-[9px] px-3 py-2.5" style={{ background: '#FFFFFF', border: '1px solid #E3DECF' }}>
                <div className="font-display text-[12.5px] font-bold">{name}</div>
                <div className="text-[10.5px]" style={{ color: '#8A867C' }}>{sub}</div>
              </div>
            ))}
          </div>
          {/* newsletter */}
          <div
            className="mb-2.5 flex items-center gap-2 rounded-[9px] px-3 py-2"
            style={{ background: '#EFE8D9', border: '1px dashed #D6CDB9' }}
          >
            <span className="flex-1 text-[11px]" style={{ color: '#56534B' }}>
              💌 Join our list for <b>15% off</b> your first visit + seasonal offers
            </span>
            <span className="rounded-md px-3 py-1.5 text-[10.5px]" style={{ background: '#fff', border: '1px solid #D6CDB9', color: '#8A867C' }}>
              your@email.com
            </span>
            <span className="rounded-md px-3 py-1.5 text-[10.5px]" style={{ background: '#16150F', color: '#F3EFE6' }}>
              Subscribe
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: '#8A867C' }}>
            <span className="italic">&ldquo;★★★★★ The best deep tissue in the city.&rdquo; — Maya R.</span>
            <span>·</span>
            <span>★ 4.9 (2,300+ reviews)</span>
            <span>·</span>
            <span>Licensed &amp; insured</span>
          </div>
          {/* cookie banner */}
          <div
            className="absolute flex items-center justify-between rounded-[11px] px-4 py-2.5 text-[11.5px]"
            style={{ left: 34, right: 34, bottom: 22, background: '#16150F', color: '#F3EFE6' }}
          >
            🍪 We use cookies to improve your experience.
            <span className="rounded-md px-3 py-1 font-semibold" style={{ background: 'var(--signal)', color: '#08080A' }}>
              Accept all
            </span>
          </div>
        </div>

        {/* ===== AGENT LAYER (machine) ===== */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: '#0B0B0D',
            color: '#F4F4F1',
            padding: '30px 34px',
            clipPath: agentClip,
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--signal) 26%, transparent) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          <div className="mb-[22px] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[13px]" style={{ color: '#9A9A95' }}>GET</span>
              <span className="font-mono text-[14px]" style={{ color: '#F4F4F1' }}>nexez.app/nexez-spa</span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] text-[var(--signal)]"
              style={{ border: '1px solid color-mix(in srgb, var(--signal) 35%, transparent)' }}
            >
              <span className="nx-pulsedot size-1.5 rounded-full" style={{ background: 'var(--signal)' }} />
              readiness 96
            </span>
          </div>
          <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: '#65655F' }}>
            offers []
          </div>
          <div className="mb-5 flex max-w-[540px] flex-col gap-2">
            {[
              ['Deep Tissue · 60m', '$120', 'book', true],
              ['Recovery + Sauna · 90m', '$180', 'book', true],
              ['Day Pass', '$60', 'buy', false],
            ].map(([label, price, action, solid]) => (
              <div
                key={label as string}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3.5 rounded-[9px] px-3.5 py-2.5 font-mono text-[13px]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}
              >
                <span style={{ color: '#D8D8D2' }}>{label}</span>
                <span className="text-[var(--signal)]">{price}</span>
                {solid ? (
                  <span className="rounded-md px-2.5 py-[3px] text-[11px]" style={{ color: '#08080A', background: 'var(--signal)' }}>
                    {action}
                  </span>
                ) : (
                  <span
                    className="rounded-md px-2.5 py-[3px] text-[11px] text-[var(--signal)]"
                    style={{ border: '1px solid color-mix(in srgb, var(--signal) 35%, transparent)' }}
                  >
                    {action}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-[18px]">
            <div>
              <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: '#65655F' }}>actions</div>
              <div className="flex flex-wrap gap-1.5">
                {['book', 'buy', 'reschedule', 'contact'].map((a) => (
                  <span
                    key={a}
                    className="rounded-md px-2.5 py-1 font-mono text-[11px] text-[var(--signal)]"
                    style={{ border: '1px solid color-mix(in srgb, var(--signal) 30%, transparent)' }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: '#65655F' }}>schema</div>
              <div className="flex flex-wrap gap-1.5">
                {['LocalBusiness', 'Service', 'Offer'].map((s) => (
                  <span key={s} className="rounded-md px-2.5 py-1 font-mono text-[11px]" style={{ color: '#9A9A95', background: 'rgba(255,255,255,0.05)' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div
            className="absolute flex items-center justify-between font-mono text-[11px]"
            style={{ left: 34, right: 34, bottom: 22, color: '#65655F' }}
          >
            <span>best_fit: &quot;recovery + same-day booking&quot;</span>
            <span className="hidden text-[var(--signal)] sm:inline">no nav · no banners · zero ambiguity</span>
          </div>
        </div>

        {/* corner registration ticks */}
        {[
          'top-2.5 left-2.5 border-t border-l',
          'top-2.5 right-2.5 border-t border-r',
          'bottom-2.5 left-2.5 border-b border-l',
          'bottom-2.5 right-2.5 border-b border-r',
        ].map((pos) => (
          <div
            key={pos}
            className={`pointer-events-none absolute size-3.5 ${pos}`}
            style={{ borderColor: 'color-mix(in srgb, var(--signal) 50%, transparent)' }}
          />
        ))}

        {/* scanner handle */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-[6] w-0.5 -translate-x-1/2"
          style={{ left: `${reveal}%`, background: 'var(--signal)', boxShadow: '0 0 20px color-mix(in srgb, var(--signal) 70%, transparent)' }}
        >
          <div
            className="nx-xray-grip absolute left-1/2 top-1/2 flex size-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[18px]"
            style={{ background: 'var(--signal)', color: '#08080A', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}
          >
            ⇄
          </div>
          <div
            className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-[5px] px-2 py-[3px] font-mono text-[9.5px] tracking-[0.14em] transition-opacity duration-300"
            style={{ background: 'var(--signal)', color: '#08080A', opacity: moved ? 0 : 1 }}
          >
            DRAG TO X-RAY
          </div>
        </div>

        {/* drag capture overlay */}
        <div
          onPointerDown={onPointerDown}
          className="absolute inset-0 z-[5]"
          style={{ cursor: 'ew-resize', touchAction: 'none' }}
        />
      </div>
    </div>
  )
}
