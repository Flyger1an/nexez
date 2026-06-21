'use client'

import { useEffect, useRef } from 'react'

// Faithful React port of the enhanced "Nexez Knowledge Graph" design (.dc.html):
// a central listing node ringed by 12 depth-clustered agent nodes (per-agent hue +
// continuous z-depth scale/blur/brightness/opacity), curved connection paths with
// data dots flowing inward (queries) or outward (offers), schema chips riding the hot
// paths, radiating pulse rings, a moving scan sweep, dot-grid / scan-lines / vignette /
// glow field, floating data fragments and registration ticks. Authored on a fixed
// 1000×1000 stage, scaled to "contain" inside its (square) panel.
//
// Rules applied (same as the live build): background + edge vignette inherit var(--bg)
// (dark in dark mode, light page colour in light mode → blends, no box); paused
// offscreen / tab-hidden / reduced-motion via svg.pauseAnimations() + CSS play-state;
// agent-node backdrop-blur dropped (the radial highlight carries the glass look and it
// is expensive across 12 floating nodes) — kept on the focal card.

const DISPLAY = 'var(--font-display, ui-sans-serif, system-ui, sans-serif)'
const MONO = 'ui-monospace, SFMono-Regular, monospace'

type AgentDef = { name: string; mono: string; ang: number; r: number; z: number; hue: number; hot?: boolean; dir?: 'out' }
type Agent = {
  name: string
  mono: string
  left: string
  top: string
  pathD: string
  stroke: string
  strokeW: string
  dotColor: string
  glyphColor: string
  ringColor: string
  haloColor: string
  labelColor: string
  keyPoints: string
  transform: string
  filter: string
  opacity: string
  dotDur: string
  floatDelay: string
}
type Chip = { left: string; top: string; text: string; color: string; border: string }

const { AGENTS, CHIPS } = ((): { AGENTS: Agent[]; CHIPS: Chip[] } => {
  const cx = 500
  const cy = 500
  const defs: AgentDef[] = [
    { name: 'ChatGPT', mono: 'Gp', ang: -82, r: 298, z: 0.12, hue: 248 },
    { name: 'Claude', mono: 'Cl', ang: -57, r: 322, z: 0.16, hue: 172, hot: true, dir: 'out' },
    { name: 'Gemini', mono: 'Gm', ang: -108, r: 362, z: 0.55, hue: 232 },
    { name: 'Perplexity', mono: 'Px', ang: -14, r: 300, z: 0.14, hue: 262, hot: true },
    { name: 'Copilot', mono: 'Co', ang: 40, r: 314, z: 0.22, hue: 220, dir: 'out' },
    { name: 'Grok', mono: 'Gk', ang: 13, r: 364, z: 0.5, hue: 248 },
    { name: 'Mistral', mono: 'Ms', ang: 96, r: 300, z: 0.12, hue: 280, hot: true },
    { name: 'Llama', mono: 'Lm', ang: 70, r: 372, z: 0.58, hue: 248 },
    { name: 'DeepSeek', mono: 'Ds', ang: 122, r: 352, z: 0.4, hue: 232, dir: 'out' },
    { name: 'Qwen', mono: 'Qw', ang: 158, r: 318, z: 0.2, hue: 172 },
    { name: 'Cohere', mono: 'Ch', ang: 196, r: 366, z: 0.52, hue: 262 },
    { name: 'Amazon Nova', mono: 'Nv', ang: 226, r: 312, z: 0.24, hue: 248, dir: 'out' },
  ]
  const chipText: Record<string, string> = { Claude: 'Offer', Perplexity: '200 OK', Mistral: '$120' }
  const chips: Chip[] = []

  const agents = defs.map((d, i) => {
    const ang = (d.ang * Math.PI) / 180
    const z = d.z
    const x = cx + Math.cos(ang) * d.r
    const y = cy + Math.sin(ang) * d.r
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

    const scale = (1.06 - z * 0.34).toFixed(3)
    const blur = (z * z * 2.4).toFixed(2)
    const bright = (1 - z * 0.28).toFixed(3)
    const opacity = (1 - z * 0.3).toFixed(3)

    const lum = Math.round(72 - z * 16)
    const glyphColor = `hsl(${d.hue} 88% ${lum}%)`
    const ringColor = `hsla(${d.hue} 80% 62% / ${(0.5 - z * 0.18).toFixed(2)})`
    const haloColor = `hsla(${d.hue} 80% 55% / ${(0.34 - z * 0.16).toFixed(2)})`
    const labelColor = `rgba(226,226,235,${(0.82 - z * 0.34).toFixed(2)})`
    const strokeOp = (d.hot ? 0.72 : 0.5) - z * 0.18
    const stroke = `hsla(${d.hue} 75% 62% / ${strokeOp.toFixed(2)})`
    const dotColor = `hsl(${d.hue} 92% ${Math.round(74 - z * 10)}%)`

    if (d.hot) {
      const px = 0.25 * sx + 0.5 * ccx + 0.25 * ex
      const py = 0.25 * sy + 0.5 * ccy + 0.25 * ey
      chips.push({
        left: `${px.toFixed(1)}px`,
        top: `${py.toFixed(1)}px`,
        text: chipText[d.name],
        color: `hsl(${d.hue} 88% 78%)`,
        border: `hsla(${d.hue} 80% 62% / 0.5)`,
      })
    }

    return {
      name: d.name,
      mono: d.mono,
      left: `${x.toFixed(1)}px`,
      top: `${y.toFixed(1)}px`,
      pathD,
      stroke,
      strokeW: d.hot ? '2' : '1.4',
      dotColor,
      glyphColor,
      ringColor,
      haloColor,
      labelColor,
      keyPoints: d.dir === 'out' ? '0;1' : '1;0',
      transform: `translate(-50%,-50%) scale(${scale})`,
      filter: `blur(${blur}px) brightness(${bright})`,
      opacity,
      dotDur: `${d.hot ? 2.6 : 3.8 + (i % 4) * 0.6}s`,
      floatDelay: `${(i * 0.4).toFixed(1)}s`,
    }
  })

  return { AGENTS: agents, CHIPS: chips }
})()

const FRAGMENTS = [
  { left: 170, top: 300, color: 'rgba(129,140,248,0.28)', rot: -4, text: 'POST /checkout · 200 OK' },
  { right: 128, top: 235, color: 'rgba(94,234,212,0.28)', rot: 3, text: 'schema.org/Offer' },
  { left: 150, bottom: 235, color: 'rgba(129,140,248,0.28)', rot: 2, text: 'price: "$120.00"' },
  { right: 185, bottom: 330, color: 'rgba(129,140,248,0.28)', rot: -3, text: 'id: your-business · MCP' },
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
        style={{ position: 'absolute', left: '50%', top: '50%', width: 1000, height: 1000, transformOrigin: 'center center', transform: 'translate(-50%,-50%) scale(0.6)' }}
      >
        {/* dot grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.13) 0.6px, transparent 0.7px)', backgroundSize: '26px 26px', backgroundPosition: '13px 13px' }} />
        {/* scan lines */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px)', opacity: 0.5 }} />
        {/* moving scan sweep */}
        <div
          className="nx-kg-scan"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 200, background: 'linear-gradient(180deg, transparent, rgba(129,140,248,0.10) 45%, rgba(129,140,248,0.14) 50%, rgba(129,140,248,0.10) 55%, transparent)', mixBlendMode: 'screen', pointerEvents: 'none' }}
        />
        {/* vignette — fades the scene edges into the page background (theme-aware) */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, transparent 38%, color-mix(in srgb, var(--bg) 62%, transparent) 76%, var(--bg) 100%)' }} />
        {/* central volumetric glow */}
        <div className="nx-kg-glow" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -380, marginTop: -380, width: 760, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.32) 0%, rgba(79,70,229,0.10) 38%, transparent 66%)', filter: 'blur(14px)' }} />

        {/* registration ticks */}
        {TICKS.map((t, i) => (
          <div key={i} style={{ position: 'absolute', left: t.left, right: t.right, top: t.top, bottom: t.bottom, font: `500 10px ${MONO}`, color: 'rgba(165,180,252,0.32)', letterSpacing: 1, whiteSpace: 'pre' }}>
            {t.text}
          </div>
        ))}

        {/* floating data fragments */}
        {FRAGMENTS.map((f, i) => (
          <div key={i} style={{ position: 'absolute', left: f.left, right: f.right, top: f.top, bottom: f.bottom, font: `500 11px ${MONO}`, color: f.color, transform: `rotate(${f.rot}deg)` }}>
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
              <path d={a.pathD} fill="none" stroke={a.stroke} strokeWidth={a.strokeW} filter="url(#nx-kg-lineGlow)" />
              <circle r="2.5" fill={a.dotColor} filter="url(#nx-kg-dotGlow)">
                <animateMotion dur={a.dotDur} repeatCount="indefinite" path={a.pathD} keyPoints={a.keyPoints} keyTimes="0;1" calcMode="linear" rotate="auto" />
              </circle>
              <circle r="2.5" fill={a.dotColor}>
                <animateMotion dur={a.dotDur} repeatCount="indefinite" path={a.pathD} keyPoints={a.keyPoints} keyTimes="0;1" calcMode="linear" rotate="auto" />
              </circle>
            </g>
          ))}
        </svg>

        {/* schema chips riding the hot paths */}
        {CHIPS.map((c, i) => (
          <div key={i} style={{ position: 'absolute', left: c.left, top: c.top, transform: 'translate(-50%,-50%)', font: `500 9px ${MONO}`, letterSpacing: 0.4, color: c.color, background: 'rgba(13,13,18,0.78)', border: `1px solid ${c.border}`, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
            {c.text}
          </div>
        ))}

        {/* agent nodes */}
        {AGENTS.map((a, i) => (
          <div key={i} style={{ position: 'absolute', left: a.left, top: a.top, transform: a.transform, opacity: Number(a.opacity), filter: a.filter }}>
            <div className="nx-kg-float" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, animationDelay: a.floatDelay }}>
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.16), rgba(255,255,255,0) 56%), rgba(24,24,33,0.6)',
                  border: `1px solid ${a.ringColor}`,
                  boxShadow: `0 0 24px ${a.haloColor}, inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -8px 16px rgba(0,0,0,0.35)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ font: `600 19px ${DISPLAY}`, letterSpacing: 0.5, color: a.glyphColor }}>{a.mono}</span>
              </div>
              <span style={{ font: `600 11px ${DISPLAY}`, letterSpacing: 2, textTransform: 'uppercase', color: a.labelColor, whiteSpace: 'nowrap' }}>{a.name}</span>
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
              background: 'radial-gradient(circle at 30% 12%, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%), rgba(18,18,26,0.66)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(99,102,241,0.42)',
              boxShadow: '0 24px 70px rgba(0,0,0,0.55), 0 0 40px rgba(79,70,229,0.28), inset 0 1px 0 rgba(255,255,255,0.08)',
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
