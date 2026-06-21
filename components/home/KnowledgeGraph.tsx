'use client'

import { useEffect, useRef } from 'react'

// Faithful React port of the "Nexez Knowledge Graph" design (originally a .dc.html):
// a central listing node ringed by 12 agent nodes, curved connection paths with
// travelling data dots, radiating pulse rings, a dot-grid / scan-line / vignette
// field, floating data fragments, and registration ticks. The scene is authored on a
// fixed 1000×1000 stage and scaled to "contain" inside its (square) panel.
//
// Adaptations from the original: agent-node backdrop-blur dropped (invisible over the
// dark field, expensive while floating) — kept on the focal card. Pauses offscreen /
// tab-hidden and under reduced-motion via SVG pauseAnimations() + CSS play-state.

const DISPLAY = 'var(--font-display, ui-sans-serif, system-ui, sans-serif)'
const MONO = 'ui-monospace, SFMono-Regular, monospace'

type Agent = {
  name: string
  glyph: string
  left: string
  top: string
  pathD: string
  stroke: string
  dotColor: string
  glyphColor: string
  ringColor: string
  haloColor: string
  transform: string
  filter: string
  opacity: number
  dotDur: string
  floatDelay: string
}

const AGENTS: Agent[] = (() => {
  const cx = 500
  const cy = 500
  const defs = [
    { name: 'ChatGPT', glyph: 'G' },
    { name: 'Claude', glyph: 'C' },
    { name: 'Gemini', glyph: 'G' },
    { name: 'Perplexity', glyph: 'P' },
    { name: 'Grok', glyph: 'X' },
    { name: 'Copilot', glyph: 'C' },
    { name: 'Llama', glyph: 'L' },
    { name: 'Mistral', glyph: 'M' },
    { name: 'DeepSeek', glyph: 'D' },
    { name: 'Qwen', glyph: 'Q' },
    { name: 'Cohere', glyph: 'C' },
    { name: 'Amazon Nova', glyph: 'N' },
  ]
  const tierPat = [0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 0, 2]
  const tealSet = new Set([1, 5, 9])
  const scaleBy = [1, 0.9, 0.8]
  const blurBy = [0, 0.7, 1.7]
  const opacBy = [1, 0.92, 0.74]

  return defs.map((d, i) => {
    const ang = ((-90 + i * 30) * Math.PI) / 180
    const tier = tierPat[i]
    const r = 296 + tier * 48 + (((i * 53) % 24) - 12)
    const x = cx + Math.cos(ang) * r
    const y = cy + Math.sin(ang) * r
    const sx = cx + Math.cos(ang) * 96
    const sy = cy + Math.sin(ang) * 96
    const ex = x - Math.cos(ang) * 40
    const ey = y - Math.sin(ang) * 40
    const mx = (sx + ex) / 2
    const my = (sy + ey) / 2
    const off = (i % 2 ? 1 : -1) * 28
    const ccx = mx - Math.sin(ang) * off
    const ccy = my + Math.cos(ang) * off
    const pathD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${ccx.toFixed(1)} ${ccy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
    const t = tealSet.has(i)
    return {
      name: d.name,
      glyph: d.glyph,
      left: `${x.toFixed(1)}px`,
      top: `${y.toFixed(1)}px`,
      pathD,
      stroke: t ? 'rgba(45,212,191,0.5)' : 'rgba(79,70,229,0.5)',
      dotColor: t ? '#5eead4' : '#818cf8',
      glyphColor: t ? '#5eead4' : '#a5b4fc',
      ringColor: t ? 'rgba(94,234,212,0.45)' : 'rgba(99,102,241,0.45)',
      haloColor: t ? 'rgba(45,212,191,0.28)' : 'rgba(79,70,229,0.32)',
      transform: `translate(-50%,-50%) scale(${scaleBy[tier]})`,
      filter: blurBy[tier] ? `blur(${blurBy[tier]}px)` : 'none',
      opacity: opacBy[tier],
      dotDur: `${3.6 + (i % 4) * 0.7}s`,
      floatDelay: `${(i * 0.4).toFixed(1)}s`,
    }
  })
})()

const FRAGMENTS = [
  { left: 170, top: 300, color: 'rgba(129,140,248,0.30)', rot: -4, text: 'POST /checkout · 200 OK' },
  { right: 128, top: 235, color: 'rgba(94,234,212,0.30)', rot: 3, text: 'schema.org/Offer' },
  { left: 150, bottom: 235, color: 'rgba(129,140,248,0.30)', rot: 2, text: 'price: "$120.00"' },
  { right: 185, bottom: 330, color: 'rgba(129,140,248,0.30)', rot: -3, text: 'id: your-business · MCP' },
]
const TICKS = [
  { left: 34, top: 34, text: '+   nexez · agent graph' },
  { right: 34, top: 34, text: '1000 × 1000   +' },
  { left: 34, bottom: 34, text: '+   12 agents · 1 source' },
  { right: 34, bottom: 34, text: 'readiness 96   +' },
]

export function KnowledgeGraph({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const wrap = wrapRef.current
    if (!root || !wrap) return
    const svg = svgRef.current

    const fit = () => {
      const s = Math.min(root.clientWidth, root.clientHeight) / 1000
      wrap.style.transform = `translate(-50%,-50%) scale(${s})`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(root)

    const setPaused = (p: boolean) => {
      root.classList.toggle('nx-kg-paused', p)
      if (svg) {
        try {
          p ? svg.pauseAnimations() : svg.unpauseAnimations()
        } catch {
          /* SMIL unsupported — CSS play-state still applies */
        }
      }
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPaused(true)
      return () => ro.disconnect()
    }

    let visible = true
    const io = new IntersectionObserver(
      (e) => {
        visible = !!e[0]?.isIntersecting
        setPaused(!visible || document.hidden)
      },
      { threshold: 0 },
    )
    io.observe(root)
    const onVis = () => setPaused(!visible || document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <div ref={rootRef} aria-hidden className={`relative h-full w-full overflow-hidden ${className ?? ''}`} style={{ background: 'var(--bg)' }}>
      <div
        ref={wrapRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 1000,
          height: 1000,
          transformOrigin: 'center center',
          transform: 'translate(-50%,-50%) scale(0.6)',
        }}
      >
        {/* dot grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.13) 0.6px, transparent 0.7px)', backgroundSize: '26px 26px', backgroundPosition: '13px 13px' }} />
        {/* scan lines */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px)', opacity: 0.5 }} />
        {/* vignette — fades the scene edges into the page background (theme-aware) */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, transparent 38%, color-mix(in srgb, var(--bg) 62%, transparent) 76%, var(--bg) 100%)' }} />
        {/* central volumetric glow */}
        <div className="nx-kg-glow" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -380, marginTop: -380, width: 760, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.32) 0%, rgba(79,70,229,0.10) 38%, transparent 66%)', filter: 'blur(14px)' }} />

        {/* registration ticks */}
        {TICKS.map((t, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: t.left,
              right: t.right,
              top: t.top,
              bottom: t.bottom,
              font: `500 10px ${MONO}`,
              color: 'rgba(165,180,252,0.32)',
              letterSpacing: 1,
              whiteSpace: 'pre',
            }}
          >
            {t.text}
          </div>
        ))}

        {/* floating data fragments */}
        {FRAGMENTS.map((f, i) => (
          <div
            key={i}
            style={{ position: 'absolute', left: f.left, right: f.right, top: f.top, bottom: f.bottom, font: `500 11px ${MONO}`, color: f.color, transform: `rotate(${f.rot}deg)` }}
          >
            {f.text}
          </div>
        ))}

        {/* connections + travelling dots + pulse rings */}
        <svg ref={svgRef} viewBox="0 0 1000 1000" width="1000" height="1000" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            <filter id="nx-kg-lineGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="nx-kg-dotGlow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
          </defs>

          {[0, 2, 4].map((begin, i) => (
            <circle key={i} cx="500" cy="500" r="120" fill="none" stroke={i === 2 ? 'rgba(94,234,212,0.45)' : 'rgba(79,70,229,0.5)'} strokeWidth="1">
              <animate attributeName="r" values="120;430" dur="6s" begin={`${begin}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values={`${i === 2 ? 0.45 : 0.5};0`} dur="6s" begin={`${begin}s`} repeatCount="indefinite" />
            </circle>
          ))}

          {AGENTS.map((a, i) => (
            <g key={i}>
              <path d={a.pathD} fill="none" stroke={a.stroke} strokeWidth="1.6" filter="url(#nx-kg-lineGlow)" />
              <circle r="2.4" fill={a.dotColor} filter="url(#nx-kg-dotGlow)">
                <animateMotion dur={a.dotDur} repeatCount="indefinite" path={a.pathD} rotate="auto" />
              </circle>
              <circle r="2.4" fill={a.dotColor}>
                <animateMotion dur={a.dotDur} repeatCount="indefinite" path={a.pathD} rotate="auto" />
              </circle>
            </g>
          ))}
        </svg>

        {/* agent nodes */}
        {AGENTS.map((a, i) => (
          <div key={i} style={{ position: 'absolute', left: a.left, top: a.top, transform: a.transform, opacity: a.opacity, filter: a.filter }}>
            <div className="nx-kg-float" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, animationDelay: a.floatDelay }}>
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: '50%',
                  background: 'rgba(20,20,28,0.72)',
                  border: `1px solid ${a.ringColor}`,
                  boxShadow: `0 0 22px ${a.haloColor}, inset 0 1px 0 rgba(255,255,255,0.08)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ font: `700 23px ${DISPLAY}`, color: a.glyphColor }}>{a.glyph}</span>
              </div>
              <span style={{ font: `600 11px ${DISPLAY}`, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(226,226,235,0.78)', whiteSpace: 'nowrap' }}>{a.name}</span>
            </div>
          </div>
        ))}

        {/* central storefront listing node */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 268 }}>
          <div className="nx-kg-cardglow" style={{ position: 'absolute', inset: -18, borderRadius: 24, background: 'radial-gradient(circle, rgba(79,70,229,0.45), transparent 70%)', filter: 'blur(10px)' }} />
          <div
            style={{
              position: 'relative',
              borderRadius: 18,
              padding: '18px 18px 16px',
              background: 'rgba(18,18,26,0.62)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(99,102,241,0.42)',
              boxShadow: '0 24px 70px rgba(0,0,0,0.55), 0 0 40px rgba(79,70,229,0.28), inset 0 1px 0 rgba(255,255,255,0.07)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(140deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 15px ${DISPLAY}`, color: '#fff', boxShadow: '0 0 16px rgba(79,70,229,0.7)' }}>N</div>
              <span style={{ font: `500 11px ${MONO}`, color: 'rgba(199,210,254,0.92)', letterSpacing: 0.3, flex: 1 }}>nexez.app/your-business</span>
              <span style={{ font: `600 10px ${MONO}`, color: '#5eead4', border: '1px solid rgba(94,234,212,0.45)', borderRadius: 999, padding: '2px 8px' }}>96</span>
            </div>
            <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.35),transparent)', marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 13 }}>
              {[
                { name: 'Premium Plan · 60m', price: '$120', action: 'book', teal: false },
                { name: 'Standard Plan · 90m', price: '$80', action: 'book', teal: false },
                { name: 'Quick Consult · 20m', price: '$40', action: 'buy', teal: true },
              ].map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, font: `500 12px ${DISPLAY}`, color: 'rgba(232,232,240,0.92)' }}>{o.name}</span>
                  <span style={{ font: `600 12px ${MONO}`, color: '#fff' }}>{o.price}</span>
                  <span
                    style={{
                      font: `600 9px ${MONO}`,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      color: o.teal ? '#5eead4' : '#a5b4fc',
                      background: o.teal ? 'rgba(45,212,191,0.16)' : 'rgba(79,70,229,0.18)',
                      border: `1px solid ${o.teal ? 'rgba(94,234,212,0.4)' : 'rgba(99,102,241,0.4)'}`,
                      borderRadius: 5,
                      padding: '2px 6px',
                    }}
                  >
                    {o.action}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['LocalBusiness', 'Service', 'Offer'].map((tag) => (
                <span key={tag} style={{ font: `500 9px ${MONO}`, letterSpacing: 0.4, color: 'rgba(165,180,252,0.85)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 999, padding: '3px 9px' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
