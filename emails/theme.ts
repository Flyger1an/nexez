// Nexez email tokens resolve the light product palette to email-safe inline
// values. Email clients cannot rely on CSS variables, and many ignore modern
// layout properties, so every template composes these shared primitives.
export const BRAND = {
  canvas: '#fafafa',
  panel: '#ffffff',
  ink: '#0a0a0a',
  muted: '#52525b',
  faint: '#71717a',
  border: '#e6e6ea',
  signal: '#FF6A33',
  signalSolid: '#C94719',
  ready: '#0E9F87',
  amber: '#C8862F',
  danger: '#b91c1c',
  white: '#ffffff',
} as const

export const NEXEZ_EMAIL_ICON_URL = 'https://nexez.app/nexez-logo.png?v=20260821'

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export const styles = {
  body: {
    backgroundColor: BRAND.canvas,
    color: BRAND.ink,
    fontFamily: FONT,
    margin: '0',
    padding: '0',
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
    borderRadius: '16px',
    overflow: 'hidden',
  } as const,
  masthead: {
    backgroundColor: BRAND.ink,
    padding: '18px 24px',
  } as const,
  iconTile: {
    backgroundColor: BRAND.white,
    borderRadius: '9px',
    height: '34px',
    padding: '6px',
    width: '34px',
  } as const,
  wordmark: {
    color: BRAND.white,
    fontSize: '17px',
    fontWeight: 800,
    letterSpacing: '0.12em',
    lineHeight: '1',
    margin: '0',
    paddingLeft: '12px',
    textTransform: 'uppercase',
  } as const,
  productLabel: {
    color: BRAND.white,
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    lineHeight: '1.3',
    margin: '0',
    opacity: 0.72,
    textAlign: 'right',
    textTransform: 'uppercase',
  } as const,
  content: {
    padding: '34px 32px 32px',
  } as const,
  eyebrow: {
    color: BRAND.signalSolid,
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    lineHeight: '1.4',
    margin: '0 0 10px',
    textTransform: 'uppercase',
  } as const,
  heading: {
    color: BRAND.ink,
    fontSize: '26px',
    fontWeight: 750,
    letterSpacing: '-0.025em',
    lineHeight: '1.2',
    margin: '0 0 12px',
  } as const,
  lead: {
    color: BRAND.muted,
    fontSize: '15px',
    lineHeight: '1.65',
    margin: '0 0 22px',
  } as const,
  status: {
    borderRadius: '999px',
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    lineHeight: '1',
    margin: '0 0 18px',
    padding: '8px 11px',
    textTransform: 'uppercase',
  } as const,
  details: {
    backgroundColor: BRAND.canvas,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '12px',
    margin: '0 0 24px',
    padding: '10px 18px',
  } as const,
  row: {
    borderBottom: `1px solid ${BRAND.border}`,
  } as const,
  rowLast: {
    borderBottom: 'none',
  } as const,
  rowKey: {
    color: BRAND.faint,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '11px 14px 11px 0',
    textTransform: 'uppercase',
    verticalAlign: 'top',
    width: '34%',
  } as const,
  rowVal: {
    color: BRAND.ink,
    fontSize: '14px',
    fontWeight: 650,
    lineHeight: '1.5',
    padding: '11px 0',
    verticalAlign: 'top',
  } as const,
  button: {
    backgroundColor: BRAND.signalSolid,
    borderRadius: '9px',
    color: BRAND.white,
    display: 'inline-block',
    fontSize: '14px',
    fontWeight: 750,
    lineHeight: '1',
    padding: '14px 20px',
    textDecoration: 'none',
  } as const,
  linkFallback: {
    color: BRAND.signalSolid,
    fontSize: '12px',
    lineHeight: '1.6',
    margin: '14px 0 0',
    overflowWrap: 'anywhere',
  } as const,
  notice: {
    borderLeft: `3px solid ${BRAND.signal}`,
    color: BRAND.muted,
    fontSize: '13px',
    lineHeight: '1.6',
    margin: '22px 0 0',
    padding: '2px 0 2px 14px',
  } as const,
  fine: {
    color: BRAND.faint,
    fontSize: '12px',
    lineHeight: '1.6',
    margin: '18px 0 0',
  } as const,
  footer: {
    padding: '22px 8px 0',
    textAlign: 'center',
  } as const,
  footerText: {
    color: BRAND.faint,
    fontSize: '11px',
    lineHeight: '1.6',
    margin: '0 0 3px',
  } as const,
  footerLink: {
    color: BRAND.signalSolid,
    textDecoration: 'none',
  } as const,
} as const

export const TONE = {
  neutral: { backgroundColor: BRAND.ink, color: BRAND.white },
  positive: { backgroundColor: BRAND.ready, color: BRAND.ink },
  caution: { backgroundColor: BRAND.amber, color: BRAND.ink },
  danger: { backgroundColor: BRAND.danger, color: BRAND.white },
} as const

export type EmailTone = keyof typeof TONE
