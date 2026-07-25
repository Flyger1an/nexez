// Embeddable readiness/certification badge businesses put on their human site.
// Pure string builder so it's unit-testable; the route just sets headers.

function scoreColor(score: number): string {
  if (score >= 80) return '#10B981' // emerald
  if (score >= 50) return '#F59E0B' // amber
  return '#EF4444' // red
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  )
}

/** Fixed geometry keeps the badge dependency-free and predictable in an <img>. */
export function buildAgentReadyBadgeSvg(score: number, verified = false, certified = false): string {
  const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score : 0)))
  const label = escapeXml(`${certified ? 'Nexez Certified' : 'Agent readiness'}${verified ? ' ✓' : ''}`)
  const value = `${clamped}/100`
  const labelW = verified ? 132 : 118
  const valueW = 54
  const w = labelW + valueW
  const color = scoreColor(clamped)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" role="img" aria-label="${certified ? 'Nexez Certified Agent-Ready' : 'Nexez agent readiness'} ${value}">
  <rect rx="6" width="${w}" height="28" fill="#0A0A0F"/>
  <rect rx="6" width="${labelW}" height="28" fill="#FF6A33"/>
  <rect x="${labelW - 6}" width="6" height="28" fill="#FF6A33"/>
  <rect x="${labelW}" width="${valueW}" height="28" fill="${color}" rx="6"/>
  <rect x="${labelW}" width="6" height="28" fill="${color}"/>
  <g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="10" y="18">${label}</text>
    <text x="${labelW + 10}" y="18" font-weight="bold">${value}</text>
  </g>
</svg>`
}
