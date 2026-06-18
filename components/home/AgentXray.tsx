'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Leaf, Lock, Monitor, ScanLine } from 'lucide-react'

/**
 * The homepage hero centerpiece: the SAME business ("Nexez Spa") rendered two ways —
 * a cluttered, ambiguous HUMAN page vs the brutally clean AGENT layer Nexez derives.
 *
 *  - Desktop (md+): a compact draggable X-RAY sized to sit in the hero's right column
 *    beside the headline. A real-feeling marketing site (promo bar, busy nav, category
 *    chips, 4 vaguely-priced services, reviews, a cookie banner) on the left; the clean
 *    machine layer on the right; a draggable vertical scanner reveals one over the
 *    other. Both halves are tuned to fill the panel with no dead space.
 *  - Mobile (<md): a single full-width view + a segmented Human/Agent toggle (default
 *    Agent — the payoff) inside a browser-chrome frame, with a one-shot derive sweep.
 *
 * Both panes are FIXED "device-screen" colors (warm paper / machine dark) that do NOT
 * theme-flip — the human-vs-machine contrast is the point (mirrors the agent-page
 * convention). Periwinkle accents use var(--signal) so they stay on-brand light + dark.
 */
export function AgentXray() {
  return (
    <>
      <XrayDesktop className="hidden w-full max-w-[600px] md:block lg:mx-0 lg:max-w-none" />
      <XrayMobile className="md:hidden" />
    </>
  )
}

// 4 offers — vague on the human side, firm on the agent side (same business).
const DESKTOP_OFFERS: [string, string, string, string, string][] = [
  // [name, duration, vaguePrice, firmPrice, action]
  ['Deep Tissue', '60 / 90 min', 'from $120*', '$120', 'book'],
  ['Recovery + Sauna', '90 min', 'pricing varies', '$180', 'book'],
  ['Hot Stone Ritual', '75 min', 'call for pricing', '$140', 'book'],
  ['Day Pass', 'all day', 'day rates*', '$60', 'buy'],
]

// ── Desktop: a compact draggable X-ray that fills the hero's right column ──────────

function XrayDesktop({ className }: { className?: string }) {
  const [reveal, setReveal] = useState(50) // 3..97 — scanner position (% from left)
  const [moved, setMoved] = useState(false)
  const draggingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const setFromClientX = useCallback((clientX: number) => {
    const el = panelRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setReveal(Math.max(3, Math.min(97, ((clientX - r.left) / r.width) * 100)))
    setMoved(true)
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (draggingRef.current) setFromClientX(e.clientX)
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

  const humanClip = `inset(0 ${(100 - reveal).toFixed(2)}% 0 0)`
  const agentClip = `inset(0 0 0 ${reveal.toFixed(2)}%)`

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* instrument labels */}
      <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-[2px]" style={{ background: '#F3EFE6' }} />
          Human view
        </span>
        <span className="flex items-center gap-1.5 text-[var(--signal)]">
          Agent view
          <span className="size-2 rounded-[2px]" style={{ background: 'var(--signal)' }} />
        </span>
      </div>

      <div
        ref={panelRef}
        className="relative h-[440px] select-none overflow-hidden rounded-[18px] border border-border"
        style={{ boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)' }}
      >
        {/* ===== HUMAN LAYER (paper) — compact, cluttered, ambiguous ===== */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col overflow-hidden"
          style={{ background: '#F3EFE6', color: '#16150F', padding: '18px 20px', clipPath: humanClip }}
        >
          {/* promo strip (full-bleed) */}
          <div className="flex items-center justify-between text-[10px]" style={{ margin: '-18px -20px 0', background: '#16150F', color: '#F3EFE6', padding: '5px 20px' }}>
            <span>
              ▸ SUMMER SALE — <b style={{ color: '#E7B14B' }}>40% off*</b> select packages
            </span>
            <span style={{ color: '#A79F8E' }}>📍 2 locations</span>
          </div>

          <div className="mt-3 flex flex-1 flex-col gap-2.5">
            {/* busy nav */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="flex size-5 items-center justify-center rounded font-display text-[11px] font-bold" style={{ background: '#16150F', color: '#F3EFE6' }}>N</div>
                <span className="font-display text-[13px] font-bold">Nexez Spa &amp; Wellness Co.</span>
              </div>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: '#6A6760' }}>
                <span>Services ▾</span>
                <span>About</span>
                <span>🔍</span>
                <span className="rounded px-2 py-0.5 font-semibold" style={{ background: '#16150F', color: '#F3EFE6' }}>Book now</span>
              </div>
            </div>

            {/* category chips */}
            <div className="flex flex-wrap gap-1">
              {['Massage', 'Facials', 'Sauna & Cold Plunge', 'Couples'].map((c) => (
                <span key={c} className="rounded-full px-2 py-[2px] text-[10px]" style={{ color: '#56534B', background: '#EAE4D6', border: '1px solid #DED7C6' }}>{c}</span>
              ))}
              <span className="rounded-full px-2 py-[2px] text-[10px] text-white" style={{ background: '#C24E3A' }}>New! IV Therapy</span>
            </div>

            {/* headline + sub */}
            <div>
              <div className="font-display text-[21px] font-extrabold leading-tight tracking-[-0.02em]">Your sanctuary in the city.</div>
              <div className="mt-1 text-[11px] leading-snug" style={{ color: '#56534B' }}>
                Award-winning therapists, same-day appointments &amp; rituals to help you feel human again. Walk-ins welcome!
              </div>
            </div>

            {/* 4 services — vague pricing (the ambiguity) */}
            <div className="grid grid-cols-2 gap-1.5">
              {DESKTOP_OFFERS.map(([name, dur, vague]) => (
                <div key={name} className="rounded-lg px-2.5 py-2" style={{ background: '#FFFFFF', border: '1px solid #E3DECF' }}>
                  <div className="font-display text-[12px] font-bold leading-tight">{name}</div>
                  <div className="mt-0.5 text-[10px]" style={{ color: '#8A867C' }}>{dur} · {vague}</div>
                </div>
              ))}
            </div>

            {/* reviews / trust */}
            <div className="mt-auto flex flex-wrap items-center gap-x-2 text-[10px]" style={{ color: '#8A867C' }}>
              <span className="italic">&ldquo;★★★★★ Best deep tissue in the city.&rdquo;</span>
              <span>· ★ 4.9 (2,300+ reviews) · Licensed</span>
            </div>
          </div>

          {/* cookie banner (full-bleed bottom) */}
          <div className="flex items-center justify-between text-[10px]" style={{ margin: '10px -20px -18px', background: '#16150F', color: '#F3EFE6', padding: '8px 20px' }}>
            🍪 We use cookies to improve your experience.
            <span className="rounded px-2.5 py-0.5 font-semibold" style={{ background: 'var(--signal)', color: '#08080A' }}>Accept all</span>
          </div>
        </div>

        {/* ===== AGENT LAYER (machine) — clean, compact ===== */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col"
          style={{
            background: '#0B0B0D',
            color: '#F4F4F1',
            padding: '18px 20px',
            clipPath: agentClip,
            backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--signal) 26%, transparent) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-[11px]" style={{ color: '#9A9A95' }}>GET</span>
              <span className="truncate font-mono text-[12px]" style={{ color: '#F4F4F1' }}>nexez.app/nexez-spa</span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] text-[var(--signal)]" style={{ border: '1px solid color-mix(in srgb, var(--signal) 35%, transparent)' }}>
              <span className="nx-pulsedot size-1.5 rounded-full" style={{ background: 'var(--signal)' }} />
              readiness 96
            </span>
          </div>
          <div className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: '#65655F' }}>offers []</div>

          <div className="mt-2 flex flex-col gap-1.5">
            {DESKTOP_OFFERS.map(([name, dur, , price, action]) => (
              <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-3 py-2 font-mono text-[12px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <span className="truncate" style={{ color: '#D8D8D2' }}>
                  {name}
                  <span style={{ color: '#65655F' }}> · {dur.replace(' min', 'm').replace(' / ', '/')}</span>
                </span>
                <span className="text-[var(--signal)]">{price}</span>
                {action === 'buy' ? (
                  <span className="rounded px-2 py-[2px] text-[10px] text-[var(--signal)]" style={{ border: '1px solid color-mix(in srgb, var(--signal) 35%, transparent)' }}>{action}</span>
                ) : (
                  <span className="rounded px-2 py-[2px] text-[10px]" style={{ color: '#08080A', background: 'var(--signal)' }}>{action}</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {['book', 'buy', 'reschedule', 'contact'].map((a) => (
              <span key={a} className="rounded px-2 py-[2px] font-mono text-[10px] text-[var(--signal)]" style={{ border: '1px solid color-mix(in srgb, var(--signal) 30%, transparent)' }}>{a}</span>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {['LocalBusiness', 'Service', 'Offer'].map((s) => (
              <span key={s} className="rounded px-2 py-[2px] font-mono text-[10px]" style={{ color: '#9A9A95', background: 'rgba(255,255,255,0.05)' }}>{s}</span>
            ))}
          </div>

          {/* structured fields the agent resolved from the page's noise (fills the pane) */}
          <div className="mt-3 flex flex-col gap-1 rounded-lg px-3 py-2.5 font-mono text-[10px] leading-tight" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              ['location', 'Austin, TX · 2 sites'],
              ['availability', 'same-day'],
              ['walk_ins', 'yes'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span style={{ color: '#65655F' }}>{k}</span>
                <span style={{ color: k === 'availability' ? 'var(--ready)' : '#9A9A95' }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 font-mono text-[10px]" style={{ color: '#65655F' }}>
            <span className="truncate">best_fit: &quot;recovery + same-day&quot;</span>
            <span className="shrink-0 text-[var(--signal)]">zero ambiguity</span>
          </div>
        </div>

        {/* corner registration ticks */}
        {['top-2.5 left-2.5 border-t border-l', 'top-2.5 right-2.5 border-t border-r', 'bottom-2.5 left-2.5 border-b border-l', 'bottom-2.5 right-2.5 border-b border-r'].map((pos) => (
          <div key={pos} className={`pointer-events-none absolute size-3 ${pos}`} style={{ borderColor: 'color-mix(in srgb, var(--signal) 50%, transparent)' }} />
        ))}

        {/* scanner handle */}
        <div className="pointer-events-none absolute bottom-0 top-0 z-[6] w-0.5 -translate-x-1/2" style={{ left: `${reveal}%`, background: 'var(--signal)', boxShadow: '0 0 20px color-mix(in srgb, var(--signal) 70%, transparent)' }}>
          <div className="nx-xray-grip absolute left-1/2 top-1/2 flex size-[42px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[16px]" style={{ background: 'var(--signal)', color: '#08080A', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>⇄</div>
          <div className="absolute left-1/2 top-3.5 -translate-x-1/2 whitespace-nowrap rounded-[5px] px-2 py-[3px] font-mono text-[9px] tracking-[0.14em] transition-opacity duration-300" style={{ background: 'var(--signal)', color: '#08080A', opacity: moved ? 0 : 1 }}>DRAG TO X-RAY</div>
        </div>

        {/* drag capture overlay */}
        <div
          onPointerDown={(e) => {
            draggingRef.current = true
            setFromClientX(e.clientX)
          }}
          className="absolute inset-0 z-[5]"
          style={{ cursor: 'ew-resize', touchAction: 'none' }}
        />
      </div>
    </div>
  )
}

// ── Mobile: a single full-width view + segmented toggle in a browser-chrome frame ──

function XrayMobile({ className }: { className?: string }) {
  const [view, setView] = useState<'human' | 'agent'>('agent') // lead with the payoff
  const [swept, setSwept] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSwept(true)
      return
    }
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSwept(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setSwept(true)
          io.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className={className}>
      <div className="nx-glass-panel relative overflow-hidden">
        {/* chrome bar */}
        <div className="flex h-11 items-center justify-between gap-2 border-b border-border bg-white/[0.02] px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-400" />
              <span className="size-2 rounded-full bg-[var(--amber)]" />
              <span className="size-2 rounded-full bg-[var(--ready)]" />
            </div>
            <span className="hidden min-w-0 items-center gap-1.5 truncate rounded-md border border-border bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">
              <Lock className="size-3 shrink-0 text-[var(--ready)]" /> nexez.app/nexez-spa
            </span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--ready)]/25 bg-[var(--ready)]/10 px-2.5 py-0.5 font-mono text-[11px] text-[var(--ready)]">
            <span className="nx-live-dot" /> readiness 96
          </span>
        </div>

        {/* stage — one full-width view */}
        <div className="relative h-[392px]">
          {view === 'human' ? <HumanPane /> : <AgentPane />}
          {swept && (
            <div
              aria-hidden
              className="nx-derive-beam pointer-events-none absolute inset-y-0 left-0 z-[5] w-1/3"
              style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--signal) 24%, transparent), transparent)' }}
            />
          )}
        </div>

        {/* segmented toggle */}
        <div className="flex h-12 items-center border-t border-border px-4">
          <div className="relative grid w-full grid-cols-2 rounded-lg border border-border bg-white/[0.03] p-0.5">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md transition-transform duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
              style={{ transform: view === 'agent' ? 'translateX(calc(100% + 4px))' : 'translateX(0)', background: 'color-mix(in srgb, var(--signal) 14%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--signal) 28%, transparent)' }}
            />
            {(['human', 'agent'] as const).map((v) => {
              const active = view === v
              const label = v === 'human' ? 'Human' : 'Agent'
              const Icon = v === 'human' ? Monitor : ScanLine
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={active}
                  aria-label={`${label} view`}
                  title={`${label} view`}
                  className="relative z-[1] flex items-center justify-center gap-1.5 rounded-md py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors"
                  style={{ color: active ? 'var(--signal)' : 'var(--fg-muted)' }}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared content panes for the mobile single-view (beautiful + clean) ─────────

// An elegant system serif for the boutique-spa "human" mock — a different voice from
// Nexez's grotesque brand (it depicts a third-party site), zero font-load.
const SERIF = 'Georgia, "Times New Roman", serif'

const OFFERS = [
  { name: 'Deep Tissue', dur: '60m', vague: 'from $120*', price: '$120', action: 'book' },
  { name: 'Recovery + Sauna', dur: '90m', vague: 'pricing varies', price: '$180', action: 'book' },
  { name: 'Day Pass', dur: '', vague: 'call for pricing', price: '$60', action: 'buy' },
]

// HUMAN — beautiful but ambiguous boutique-spa site (fixed warm colors; does NOT theme-flip).
function HumanPane() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ background: 'linear-gradient(165deg, #FCF9F3 0%, #F4ECDF 100%)', color: '#2A2520' }}>
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(143,166,142,0.40), transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full" style={{ background: 'radial-gradient(circle, rgba(233,201,192,0.45), transparent 70%)' }} />

      <div className="relative flex items-center justify-center gap-1.5 px-4 py-1.5 text-[10px] tracking-[0.04em]" style={{ background: 'linear-gradient(90deg, rgba(201,162,75,0.16), rgba(233,201,192,0.24), rgba(201,162,75,0.16))', color: '#8A6A2E', borderBottom: '1px solid rgba(201,162,75,0.18)' }}>
        <span>✦</span> Summer reset — <b style={{ fontWeight: 700 }}>20% off*</b> · ends soon
      </div>

      <div className="relative flex flex-1 flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-[26px] items-center justify-center rounded-full" style={{ background: 'linear-gradient(140deg, #93A98F, #6C8A74)', color: '#FCF9F3' }}>
              <Leaf className="size-3.5" />
            </span>
            <span style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: 600 }}>Nexez Spa</span>
          </div>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: '#9A8E7C' }}>
            <span className="hidden sm:inline">Services</span>
            <span className="hidden sm:inline">About</span>
            <span className="rounded-full px-3 py-1 font-medium" style={{ background: '#2A2520', color: '#FCF9F3' }}>Book now</span>
          </div>
        </div>

        <div className="relative flex flex-col justify-center overflow-hidden rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(120deg, #D7E2D0 0%, #EFE2D3 50%, #F3D7CE 100%)', minHeight: '90px' }}>
          <div aria-hidden className="pointer-events-none absolute -right-2 -top-4 size-20 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.75), transparent 70%)' }} />
          <p className="relative text-[8.5px] uppercase tracking-[0.3em]" style={{ color: '#7C8A77' }}>tranquility, restored</p>
          <h3 className="relative mt-1.5" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '23px', lineHeight: 1.08, fontWeight: 600, color: '#322B23' }}>
            Your sanctuary<br />in the city
          </h3>
        </div>

        <div className="flex flex-col">
          {OFFERS.map((o, i) => (
            <div key={o.name} className="flex items-baseline gap-2.5 py-[7px]" style={i ? { borderTop: '1px solid rgba(120,100,70,0.13)' } : undefined}>
              <span style={{ fontFamily: SERIF, fontSize: '13.5px', color: '#322B23' }}>{o.name}</span>
              <span aria-hidden className="relative bottom-px h-px flex-1" style={{ background: 'repeating-linear-gradient(90deg, rgba(120,100,70,0.28) 0 1.5px, transparent 1.5px 5px)' }} />
              <span className="italic" style={{ fontFamily: SERIF, fontSize: '12px', color: '#A2895F' }}>{o.vague}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[10px]" style={{ color: '#9A8E7C' }}>
            <span style={{ color: '#C9A24B', letterSpacing: '1.5px', fontSize: '9px' }}>★★★★★</span> 4.9 · Licensed · As seen in…
          </span>
          <span className="text-[9px] italic" style={{ color: '#B3A894' }}>*prices vary by therapist &amp; time</span>
        </div>
      </div>
    </div>
  )
}

// AGENT — the clean machine layer (fixed dark; does NOT theme-flip).
function AgentPane() {
  return (
    <div className="flex h-full flex-col gap-3 p-5" style={{ background: '#08080C' }}>
      <div className="flex items-center justify-between gap-2 font-mono">
        <span className="truncate text-[11px]" style={{ color: '#D4D4D8' }}>GET nexez.app/nexez-spa</span>
        <span className="shrink-0 text-[10px] text-[var(--ready)]">200 OK</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {OFFERS.map((o) => (
          <div key={o.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md px-3 py-2.5 text-[12px]" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
            <span className="truncate" style={{ color: '#E5E5E8' }}>
              {o.name}
              {o.dur ? <span style={{ color: '#8B8B93' }}> · {o.dur}</span> : null}
            </span>
            <span className="font-mono text-[13px] text-[var(--signal)]">{o.price}</span>
            <span className="rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-2 py-0.5 text-[10px] text-[var(--ready)]">{o.action}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['book', 'buy', 'reschedule', 'contact'].map((a) => (
          <span key={a} className="rounded-full px-2 py-0.5 font-mono text-[10px] text-[var(--signal)]" style={{ border: '1px solid color-mix(in srgb, var(--signal) 30%, transparent)' }}>{a}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['LocalBusiness', 'Service', 'Offer'].map((s) => (
          <span key={s} className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#9A9AA3' }}>{s}</span>
        ))}
      </div>
      <p className="mt-auto font-mono text-[10px]" style={{ color: '#6B6B73' }}>{'// zero ambiguity'}</p>
    </div>
  )
}
