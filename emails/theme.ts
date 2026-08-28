// Nexez email tokens.
//
// Email cannot use CSS custom properties, backdrop-filter, or the cursor-tracked
// specular that carries the product's liquid-glass identity. So this is a
// translation of DESIGN_SYSTEM.md, not a port: the brand survives through the
// neutral ramp, the persimmon signal, the pill, and mono data. Nothing here
// tries to fake frost.
//
// Values are resolved from the light theme in DESIGN_SYSTEM.md §1. Where the
// system specifies rgba over --bg, the alpha is flattened against the surface
// the token actually sits on, because email has no compositing to rely on.

export const BRAND = {
  // Neutrals. The design system's light ramp is blue-tinted (#0D1016 ink over
  // an #F4F5F8 canvas). Flattened here rather than substituted with a neutral
  // grey ramp, which is what makes an email read as a different company.
  canvas: '#F4F5F8',        // --bg
  panel: '#FFFFFF',
  ink: '#0D1016',           // --text
  muted: '#696B6F',         // --muted  rgba(13,16,22,.62) on white
  faint: '#9E9FA2',         // --faint  rgba(13,16,22,.40) on white
  border: '#E2E3E6',        // --line   rgba(13,16,22,.12) on white
  borderSoft: '#EDEEF1',    // --line-soft
  fill: '#F7F8FA',          // --fill-1

  // Signals. These were already correct and are unchanged.
  signal: '#FF6A33',        // --signal
  signalSolid: '#C94719',   // --signal-solid, AA against white text
  ready: '#0E9F87',         // --ready (light)
  amber: '#C8862F',         // --amber (light)
  danger: '#B3402B',
  white: '#FFFFFF',

  // Dark counterparts. The product default theme is pure black, so an email
  // that only exists in light mode is the off-brand one.
  darkCanvas: '#000000',    // --bg dark
  darkPanel: '#0B0E13',
  darkInk: '#EEF1F8',       // --text dark
  darkMuted: '#9DA2AD',
  darkFaint: '#70747E',
  darkBorder: '#1E232C',
  darkFill: '#12151B',
  darkReady: '#5FEAD3',     // --ready dark
  darkAmber: '#FFD9A8',     // --amber dark
  darkSignal: '#FF8452',
} as const

// Asset URLs carry NO query string. A "?v=" cache-buster on an image is a known
// failure mode: Outlook's Word engine and several corporate mail scanners drop or
// mangle the query, and the old URL needed &-escaping in tests, which is the same
// fragility showing up somewhere safe. Version through the filename instead.
//
// Hosted on nexez.ai rather than nexez.app: the marketing domain is public by
// definition, where the app domain is one edge-auth change away from 403-ing
// every logo in every email already delivered.

/** Masthead lockup: monogram + NEXEZ wordmark. Ships 1200x200, displays 204x34.
 *  This is the legacy filename, deliberately: it is what is deployed, and the
 *  bytes behind it are now correct (artwork on #0D1016, no alpha). The earlier
 *  white-on-white version at this path is gone. A -v2 asset exists at 336x56 and
 *  saves ~10KB per send, but do not point this at it until it is committed. */
export const NEXEZ_EMAIL_LOGO_URL = 'https://nexez.ai/nexez-email-logo-white.png'
/** Ink lockup, for any light-background surface. */
export const NEXEZ_EMAIL_LOGO_INK_URL = 'https://nexez.ai/nexez-email-logo-ink-v2.png' // not yet committed
/** Monogram alone, for square contexts (avatars, Resend broadcast icon). */
export const NEXEZ_EMAIL_ICON_URL = 'https://nexez.app/nexez-email-icon.png' // deployed; pinned by brand-asset.test.ts

// The masthead is the logo's alone now, so it gets room. 6:1, matching the asset.
export const LOGO_W = 204
export const LOGO_H = 34

// Brand faces first for the clients that honour webfonts (Apple Mail, iOS,
// Samsung, Thunderbird). Everything after is what Outlook and Gmail will
// actually use, chosen so the fallback keeps the same proportions.
export const FONT_DISPLAY =
  "'Schibsted Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif"
export const FONT_BODY =
  "'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
// DESIGN_SYSTEM.md §1: "JetBrains Mono 400/500 (all data: prices, payloads,
// labels, scores)." Data in mono is the most recognisable thing the product
// does typographically and it costs nothing in email.
export const FONT_MONO =
  "'JetBrains Mono',ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace"

export const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;600;700' +
  '&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'

export const styles = {
  body: {
    backgroundColor: BRAND.canvas,
    color: BRAND.ink,
    fontFamily: FONT_BODY,
    margin: '0',
    padding: '0',
    WebkitFontSmoothing: 'antialiased',
  } as const,
  container: {
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '28px 20px',
  } as const,
  frame: {
    backgroundColor: BRAND.panel,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '20px',
    overflow: 'hidden',
  } as const,
  masthead: {
    backgroundColor: BRAND.ink,
    backgroundImage: `linear-gradient(${BRAND.ink}, ${BRAND.ink})`,
    padding: '20px 26px',
  } as const,
  // The alt text is styled so an images-off client still shows a white NEXEZ
  // wordmark on the dark bar instead of an empty rectangle. Most clients render
  // alt using the img's own styles, which is the whole trick.
  logo: {
    display: 'block',
    height: `${LOGO_H}px`,
    width: `${LOGO_W}px`,
    border: '0',
    outline: 'none',
    textDecoration: 'none',
    color: '#FFFFFF',
    fontFamily: FONT_DISPLAY,
    fontSize: '19px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: `${LOGO_H}px`,
    msInterpolationMode: 'bicubic',
  } as const,
  productLabel: {
    color: BRAND.white,
    fontFamily: FONT_MONO,
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.16em',
    lineHeight: '1.3',
    margin: '0',
    opacity: 0.66,
    textAlign: 'right',
    textTransform: 'uppercase',
  } as const,
  // The prism hairline is the one place DESIGN_SYSTEM.md allows multicolour, and
  // a 3px bar under the masthead is the only form of it email can render.
  prismRule: {
    backgroundColor: BRAND.signal,
    backgroundImage: `linear-gradient(90deg, ${BRAND.signal} 0%, ${BRAND.ready} 55%, ${BRAND.amber} 100%)`,
    fontSize: '0',
    lineHeight: '0',
    height: '3px',
  } as const,
  content: { padding: '32px 30px 30px' } as const,
  eyebrow: {
    color: BRAND.faint,
    fontFamily: FONT_MONO,
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.16em',
    lineHeight: '1.4',
    margin: '0 0 14px',
    textTransform: 'uppercase',
  } as const,
  heading: {
    color: BRAND.ink,
    fontFamily: FONT_DISPLAY,
    fontSize: '27px',
    fontWeight: 700,
    letterSpacing: '-0.035em',   // §1: display letter-spacing
    lineHeight: '1.18',
    margin: '0 0 12px',
  } as const,
  lead: {
    color: BRAND.muted,
    fontSize: '15px',
    lineHeight: '1.65',
    margin: '0 0 24px',
  } as const,
  status: {
    borderRadius: '999px',
    display: 'inline-block',
    fontFamily: FONT_MONO,
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    lineHeight: '1',
    margin: '0 0 16px',
    padding: '8px 12px',
    textTransform: 'uppercase',
  } as const,
  details: {
    backgroundColor: BRAND.fill,
    border: `1px solid ${BRAND.borderSoft}`,
    borderRadius: '14px',
    margin: '0 0 26px',
    padding: '4px 18px',
    width: '100%',
  } as const,
  // Borders live on the cell, never the row: Outlook drops border on <tr>,
  // which is why the rules were missing in half the clients.
  rowKey: {
    borderBottom: `1px solid ${BRAND.borderSoft}`,
    color: BRAND.faint,
    fontFamily: FONT_MONO,
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    padding: '13px 14px 13px 0',
    textTransform: 'uppercase',
    verticalAlign: 'top',
    width: '36%',
  } as const,
  rowVal: {
    borderBottom: `1px solid ${BRAND.borderSoft}`,
    color: BRAND.ink,
    fontFamily: FONT_MONO,
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: '1.55',
    padding: '13px 0',
    verticalAlign: 'top',
  } as const,
  rowKeyLast: { borderBottom: 'none' } as const,
  rowValLast: { borderBottom: 'none' } as const,

  // ── Onboarding primitives ───────────────────────────────────────────────────
  // A welcome is instructions, not a receipt, so it gets a numbered list rather
  // than the label/value InfoRows table. Same fill, radius and hairline as the
  // details table so the two read as one family rather than two systems.
  sectionLabel: {
    color: BRAND.faint,
    fontFamily: FONT_MONO,
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.16em',
    lineHeight: '1.4',
    margin: '0 0 12px',
    textTransform: 'uppercase',
  } as const,
  steps: {
    backgroundColor: BRAND.fill,
    border: `1px solid ${BRAND.borderSoft}`,
    borderRadius: '14px',
    margin: '0 0 26px',
    padding: '4px 18px',
    width: '100%',
  } as const,
  // The ordinal is the one place the signal colour appears outside the button.
  // It is a counter, not decoration: it tells you how many steps are left.
  stepNum: {
    borderBottom: `1px solid ${BRAND.borderSoft}`,
    color: BRAND.signalSolid,
    fontFamily: FONT_MONO,
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '1.6',
    padding: '14px 14px 14px 0',
    verticalAlign: 'top',
    width: '22px',
  } as const,
  // Body face, not mono: these are sentences to read, where InfoRows holds data
  // to scan. Mono here would make instructions look like a payload.
  stepText: {
    borderBottom: `1px solid ${BRAND.borderSoft}`,
    color: BRAND.ink,
    fontSize: '14px',
    lineHeight: '1.6',
    padding: '14px 0',
    verticalAlign: 'top',
  } as const,
  // Painted, not bordered: Outlook drops border-top on a block-level element
  // often enough that the prismRule already uses this same fill-a-1px-box trick.
  divider: {
    backgroundColor: BRAND.borderSoft,
    fontSize: '0',
    height: '1px',
    lineHeight: '0',
    margin: '30px 0 22px',
  } as const,
  nextItem: { margin: '0 0 20px' } as const,
  nextItemLast: { margin: '0' } as const,
  nextTitle: {
    color: BRAND.ink,
    fontFamily: FONT_DISPLAY,
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '-0.012em',
    lineHeight: '1.4',
    margin: '0 0 3px',
  } as const,
  nextBody: {
    color: BRAND.muted,
    fontSize: '13px',
    lineHeight: '1.6',
    margin: '0 0 6px',
  } as const,
  nextLink: {
    color: BRAND.signalSolid,
    fontSize: '13px',
    fontWeight: 600,
    lineHeight: '1.6',
    textDecoration: 'none',
  } as const,

  // ── Findings ────────────────────────────────────────────────────────────────
  // A check and its outcome, which is neither a fact to scan nor a sentence to
  // read. The label stays in the body face so it reads as a question that was
  // asked; the outcome stays mono and tone-coloured so a failure is visible
  // before a word of it is read.
  findings: {
    backgroundColor: BRAND.fill,
    border: `1px solid ${BRAND.borderSoft}`,
    borderRadius: '14px',
    margin: '0 0 18px',
    padding: '4px 18px',
    width: '100%',
  } as const,
  findingDotCell: {
    borderBottom: `1px solid ${BRAND.borderSoft}`,
    padding: '15px 12px 15px 0',
    verticalAlign: 'top',
    width: '16px',
  } as const,
  // A div rather than a glyph. Every tick and cross character has at least one
  // client that renders it as a box, and the Word engine is the usual culprit.
  findingDot: {
    borderRadius: '999px',
    fontSize: '0',
    height: '8px',
    lineHeight: '0',
    marginTop: '6px',
    width: '8px',
  } as const,
  findingLabel: {
    borderBottom: `1px solid ${BRAND.borderSoft}`,
    color: BRAND.ink,
    fontSize: '14px',
    lineHeight: '1.5',
    padding: '14px 10px 14px 0',
    verticalAlign: 'top',
  } as const,
  findingOutcome: {
    borderBottom: `1px solid ${BRAND.borderSoft}`,
    fontFamily: FONT_MONO,
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.08em',
    lineHeight: '1.5',
    padding: '15px 0 14px',
    textAlign: 'right',
    textTransform: 'uppercase',
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  } as const,

  // ── Quote ───────────────────────────────────────────────────────────────────
  // Prose somebody else wrote. It was going through the mono data cell, which is
  // the wrong face, the wrong measure, and drops the author's line breaks.
  quote: {
    borderLeft: `2px solid ${BRAND.border}`,
    margin: '0 0 24px',
    padding: '2px 0 2px 16px',
  } as const,
  quoteBody: {
    color: BRAND.ink,
    fontSize: '14.5px',
    lineHeight: '1.68',
    margin: '0',
    whiteSpace: 'pre-wrap',
  } as const,
  quoteAttribution: {
    color: BRAND.faint,
    fontFamily: FONT_MONO,
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    lineHeight: '1.4',
    margin: '10px 0 0',
    textTransform: 'uppercase',
  } as const,
  // The pill. DESIGN_SYSTEM.md calls the liquid button "the signature"; email
  // cannot do the sheen or the specular, but the pill radius is free and it is
  // the shape people recognise. A 9px rounded rect is any SaaS on earth.
  button: {
    backgroundColor: BRAND.signalSolid,
    borderRadius: '999px',
    color: BRAND.white,
    display: 'inline-block',
    fontFamily: FONT_BODY,
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: '1',
    padding: '15px 26px',
    textDecoration: 'none',
  } as const,
  linkFallback: {
    color: BRAND.muted,
    fontSize: '12px',
    lineHeight: '1.6',
    margin: '16px 0 0',
    overflowWrap: 'anywhere',
  } as const,
  notice: {
    borderLeft: `2px solid ${BRAND.border}`,
    color: BRAND.muted,
    fontSize: '13px',
    lineHeight: '1.6',
    margin: '24px 0 0',
    padding: '2px 0 2px 14px',
  } as const,
  caption: {
    color: BRAND.muted,
    fontSize: '13px',
    lineHeight: '1.65',
    margin: '0 0 24px',
  } as const,
  fine: {
    color: BRAND.faint,
    fontSize: '12px',
    lineHeight: '1.6',
    margin: '18px 0 0',
  } as const,
  footer: { padding: '22px 10px 0', textAlign: 'center' } as const,
  footerText: {
    color: BRAND.faint,
    fontSize: '11px',
    lineHeight: '1.7',
    margin: '0 0 3px',
  } as const,
  footerLink: { color: BRAND.signalSolid, textDecoration: 'none' } as const,
  link: { color: BRAND.signalSolid, textDecoration: 'underline' } as const,
} as const

// Tone maps to the design system's meaning colours. Rule 3: colour signals
// meaning, never decoration, so a badge only ever takes one of these four.
export const TONE = {
  neutral: { backgroundColor: BRAND.fill, color: BRAND.muted, border: `1px solid ${BRAND.border}` },
  positive: { backgroundColor: '#E4F5F1', color: '#0A7A68', border: '1px solid #BFE7DF' },
  caution: { backgroundColor: '#FBF1E0', color: '#8A5C13', border: '1px solid #F0DFC0' },
  danger: { backgroundColor: '#F8E7E3', color: '#93321F', border: '1px solid #EFCFC8' },
} as const

/**
 * The same four meanings as TONE, resolved for text on the fill surface rather
 * than for a pill. TONE's colours are tuned against their own tinted
 * backgrounds and are too light to sit directly on --fill-1.
 */
export const FINDING_TONE = {
  neutral: { text: BRAND.muted, dot: BRAND.faint },
  positive: { text: '#0A7A68', dot: BRAND.ready },
  caution: { text: '#8A5C13', dot: BRAND.amber },
  danger: { text: '#93321F', dot: BRAND.danger },
} as const

export type EmailTone = keyof typeof TONE
