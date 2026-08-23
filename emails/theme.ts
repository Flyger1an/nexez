// EXACT Nexez brand palette for email (the LIGHT-theme token values — email has no
// theme toggle, and the design system reads best in light). These mirror the CSS
// tokens in app/globals.css `html.light`; keep them in sync if the brand shifts:
//   --signal #FF6A33 · --signal-solid #C94719 · --ready #0E9F87 · --amber #C8862F
//   --bg #fafafa · --panel #ffffff · --fg #0a0a0a · --fg-muted #52525b · --fg-muted-2 #71717a
// Email clients can't use CSS variables, so we hardcode the resolved values here —
// one source of truth for every template.
export const BRAND = {
  bg: '#fafafa', // --bg (body)
  panel: '#ffffff', // --panel (card)
  fg: '#0a0a0a', // --fg (text)
  fgMuted: '#52525b', // --fg-muted (labels)
  fgFaint: '#71717a', // --fg-muted-2 (footnotes)
  border: '#e6e6ea', // light hairline (solid, ~ --bd-10 over white)
  signal: '#FF6A33', // --signal (accent text / links)
  signalSolid: '#C94719', // --signal-solid (deep persimmon — white-text button fill, AA contrast)
  ready: '#0E9F87', // --ready (positive: paid / confirmed)
  amber: '#C8862F', // --amber (caution: refund requested)
  danger: '#b91c1c', // sanctioned light-mode red (dispute / problem)
  white: '#ffffff',
} as const

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// Shared, email-safe inline styles. No CSS vars, no shorthand that Outlook chokes on.
export const styles = {
  body: { backgroundColor: BRAND.bg, fontFamily: FONT, margin: '0', padding: '0' } as const,
  // `width` (px) alongside maxWidth so Outlook (which ignores CSS max-width) still caps
  // near 560px; the MSO ghost table in BrandedEmail is the belt-and-suspenders.
  container: { width: '560px', maxWidth: '560px', margin: '0 auto', padding: '24px' } as const,
  header: { padding: '4px 0 18px' } as const,
  // Periwinkle logo mark (CSS box — renders everywhere, incl. SVG-stripping clients).
  logoMark: {
    display: 'inline-block',
    backgroundColor: BRAND.signalSolid,
    color: BRAND.white,
    fontWeight: 700,
    fontSize: '13px',
    width: '24px',
    height: '24px',
    lineHeight: '24px',
    textAlign: 'center',
    borderRadius: '7px',
    marginRight: '9px',
    verticalAlign: 'middle',
  } as const,
  wordmark: { fontSize: '20px', fontWeight: 700, color: BRAND.fg, margin: '0', letterSpacing: '-0.01em', verticalAlign: 'middle' } as const,
  footerRule: { borderColor: BRAND.border, borderTopWidth: '1px', borderStyle: 'solid', borderBottom: 'none', borderLeft: 'none', borderRight: 'none', margin: '24px 0 14px' } as const,
  card: {
    backgroundColor: BRAND.panel,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '12px',
    padding: '28px',
  } as const,
  heading: { fontSize: '20px', fontWeight: 700, color: BRAND.fg, margin: '0 0 8px', lineHeight: '1.3' } as const,
  lead: { fontSize: '15px', color: BRAND.fg, lineHeight: '1.6', margin: '0 0 18px' } as const,
  rowKey: { fontSize: '13px', color: BRAND.fgMuted, padding: '4px 12px 4px 0', verticalAlign: 'top', width: '36%' } as const,
  rowVal: { fontSize: '14px', color: BRAND.fg, fontWeight: 600, padding: '4px 0', verticalAlign: 'top' } as const,
  button: {
    backgroundColor: BRAND.signalSolid,
    color: BRAND.white,
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    padding: '12px 20px',
    borderRadius: '8px',
    display: 'inline-block',
  } as const,
  fine: { fontSize: '12px', color: BRAND.fgFaint, lineHeight: '1.6', margin: '16px 0 0' } as const,
  footer: { padding: '20px 4px 0' } as const,
  footerText: { fontSize: '12px', color: BRAND.fgFaint, lineHeight: '1.6', margin: '0 0 2px' } as const,
  footerLink: { color: BRAND.signal, textDecoration: 'none' } as const,
} as const

// Per-tone heading colors (semantic), all from the brand token set.
export const TONE = {
  neutral: BRAND.fg,
  positive: BRAND.ready,
  caution: BRAND.amber,
  danger: BRAND.danger,
} as const
