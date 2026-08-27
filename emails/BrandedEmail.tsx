import * as React from 'react'
import {
  Html, Head, Preview, Body, Container, Section, Row, Column,
  Text, Button, Heading, Link, Img,
} from '@react-email/components'
import {
  BRAND, FONT_LINK, FONT_MONO, LOGO_H, LOGO_W, NEXEZ_EMAIL_LOGO_URL,
  styles, TONE, type EmailTone,
} from './theme'

const MSO_OPEN = '<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td width="600"><![endif]-->'
const MSO_CLOSE = '<!--[if mso]></td></tr></table><![endif]-->'
const Mso = ({ html }: { html: string }) => (
  <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}
       dangerouslySetInnerHTML={{ __html: html }} />
)

// Inline styles always win over media queries, so dark mode has to come from
// classes with !important. Gmail, Apple Mail, iOS and Outlook.com all honour a
// <style> block; the ones that strip it simply stay light, which is a fine
// floor rather than a broken email.
const DARK_CSS = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }

  /* The masthead is pinned in EVERY mode, not just dark. Gmail's dark engine
     rewrites any region it thinks it owns, and a bare inline background-color
     is exactly that. The logo art is flattened onto this same ink, so if the
     bar flips and the image does not (Gmail never inverts images) you get a
     dark rectangle floating on white. Pinning the bar keeps them in step. */
  .nx-masthead, .nx-logocell { background-color:#0D1016 !important;
    background-image:linear-gradient(#0D1016,#0D1016) !important; }
  @media (prefers-color-scheme: dark) {
    .nx-body   { background-color:${BRAND.darkCanvas} !important; }
    .nx-frame  { background-color:${BRAND.darkPanel} !important;
                 border-color:${BRAND.darkBorder} !important; }
    .nx-panel  { background-color:${BRAND.darkPanel} !important; }
    .nx-fill   { background-color:${BRAND.darkFill} !important;
                 border-color:${BRAND.darkBorder} !important; }
    .nx-ink    { color:${BRAND.darkInk} !important; }
    .nx-muted  { color:${BRAND.darkMuted} !important; }
    .nx-faint  { color:${BRAND.darkFaint} !important; }
    .nx-rule   { border-color:${BRAND.darkBorder} !important; }
    .nx-link   { color:${BRAND.darkSignal} !important; }
    .nx-badge-neutral  { background-color:${BRAND.darkFill} !important;
                         color:${BRAND.darkMuted} !important; border-color:${BRAND.darkBorder} !important; }
    .nx-badge-positive { background-color:#0C2B26 !important; color:${BRAND.darkReady} !important; border-color:#14453C !important; }
    .nx-badge-caution  { background-color:#2E2411 !important; color:${BRAND.darkAmber} !important; border-color:#4A3A1B !important; }
    .nx-badge-danger   { background-color:#331612 !important; color:#F0A292 !important; border-color:#4D231C !important; }
    .nx-masthead, .nx-logocell { background-color:#0D1016 !important; }
  }
  [data-ogsc] .nx-body  { background-color:${BRAND.darkCanvas} !important; }
  [data-ogsc] .nx-frame { background-color:${BRAND.darkPanel} !important; border-color:${BRAND.darkBorder} !important; }
  [data-ogsc] .nx-ink   { color:${BRAND.darkInk} !important; }
  [data-ogsc] .nx-muted { color:${BRAND.darkMuted} !important; }
  [data-ogsc] .nx-faint { color:${BRAND.darkFaint} !important; }
  [data-ogsc] .nx-masthead, [data-ogsc] .nx-logocell { background-color:#0D1016 !important; }
  /* Clients auto-linkify anything that looks like an address, phone or date and
     style it themselves, which paints a blue underlined link over mono ink in the
     detail table. Apple exposes the hook directly; Gmail and Android wrap the text
     in a plain anchor, so the data cells disown anchor styling too. */
  a[x-apple-data-detectors], a[href^="tel"], a[href^="mailto"] {
    color:inherit !important; text-decoration:none !important;
    font-size:inherit !important; font-family:inherit !important;
    font-weight:inherit !important; line-height:inherit !important; }
  .nx-ink a, .nx-faint a, .nx-rule a {
    color:inherit !important; text-decoration:none !important;
    font-family:inherit !important; font-weight:inherit !important; }
  /* The two places a link SHOULD look like one keep their own colour. */
  a.nx-link { text-decoration:underline !important; }
  img { -ms-interpolation-mode:bicubic; }
  .nx-logo { image-rendering:auto; }
  @media (prefers-color-scheme: dark) {
    .nx-logo { filter:none !important; -webkit-filter:none !important; }
  }
  @media only screen and (max-width:620px) {
    .nx-content { padding:26px 20px 24px !important; }
    .nx-h1      { font-size:23px !important; }
    .nx-btn     { display:block !important; text-align:center !important; }
  }
`

export type EmailCategory =
  | 'Buyer order' | 'Merchant action' | 'Account update'
  | 'Support operations' | 'Founding cohort'

export function BrandedEmail({
  preview, category: _category, children,
}: {
  preview: string
  /** Retained for call-site compatibility. No longer rendered: the masthead is
   *  the logo's alone, and each template's eyebrow already names the object. */
  category?: EmailCategory
  children: React.ReactNode
}) {
  const year = new Date().getFullYear()
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <link rel="stylesheet" href={FONT_LINK} />
        <style dangerouslySetInnerHTML={{ __html: DARK_CSS }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body className="nx-body" style={styles.body}>
        <Mso html={MSO_OPEN} />
        <Container style={styles.container}>
          <Section className="nx-frame" style={styles.frame}>
            <Section className="nx-masthead" style={styles.masthead}>
              <Row>
                <Column align="left" className="nx-logocell"
                        {...({ bgcolor: '#0D1016' } as Record<string, string>)}
                        style={{ verticalAlign: 'middle', backgroundColor: '#0D1016' }}>
                  {/* border="0" must be the ATTRIBUTE, not CSS: Outlook and older
                      clients draw a link border around an image without it. React's
                      img typings dropped the legacy attribute, hence the spread. */}
                  <Img alt="Nexez" height={LOGO_H} width={LOGO_W}
                       {...({ border: '0' } as Record<string, string>)}
                       src={NEXEZ_EMAIL_LOGO_URL} className="nx-logo" style={styles.logo} />
                </Column>
              </Row>
            </Section>
            {/* The only multicolour element email gets. DESIGN_SYSTEM.md rule 2. */}
            <Section style={styles.prismRule}>&nbsp;</Section>
            <Section className="nx-content nx-panel" style={styles.content}>{children}</Section>
          </Section>
          <Section style={styles.footer}>
            <Text className="nx-faint" style={styles.footerText}>
              Nexez makes your business easy for people and AI agents to buy from.
            </Text>
            <Text className="nx-faint" style={styles.footerText}>
              © {year} Nexez · Reply to this email for support.
            </Text>
          </Section>
        </Container>
        <Mso html={MSO_CLOSE} />
      </Body>
    </Html>
  )
}

/** The object this email is about. One word or two, always the same vocabulary. */
export function EmailEyebrow({ children }: { children: React.ReactNode }) {
  return <Text className="nx-faint" style={styles.eyebrow}>{children}</Text>
}

/** The state that object is now in. Never repeats a word from the heading. */
export function StatusBadge({ tone = 'neutral', children }: { tone?: EmailTone; children: React.ReactNode }) {
  return (
    <Text className={`nx-badge-${tone}`} style={{ ...styles.status, ...TONE[tone] }}>
      {children}
    </Text>
  )
}

/**
 * What happened, in the reader's terms. Sentence case, plain verb.
 * Tone no longer recolours the heading: DESIGN_SYSTEM.md rule 2 keeps headlines
 * tonal, and a teal headline over a teal badge was saying the same thing twice.
 */
export function EmailHeading({ children }: { children: React.ReactNode }) {
  return (
    <Heading as="h1" className="nx-h1 nx-ink" style={styles.heading}>
      {children}
    </Heading>
  )
}

/** One sentence on what it means for them. Not a restatement of the heading. */
export function Lead({ children }: { children: React.ReactNode }) {
  return <Text className="nx-muted" style={styles.lead}>{children}</Text>
}

/** Facts. Always mono, per DESIGN_SYSTEM.md §1. */
export function InfoRows({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  const present = rows.filter(([, value]) => value)
  if (!present.length) return null
  return (
    <Section className="nx-fill" style={styles.details}>
      {present.map(([key, value], index) => {
        const last = index === present.length - 1
        return (
          <Row key={`${key}-${index}`}>
            <Column className="nx-faint nx-rule"
                    style={last ? { ...styles.rowKey, ...styles.rowKeyLast } : styles.rowKey}>
              {key}
            </Column>
            <Column className="nx-ink nx-rule"
                    style={last ? { ...styles.rowVal, ...styles.rowValLast } : styles.rowVal}>
              {value}
            </Column>
          </Row>
        )
      })}
    </Section>
  )
}

/** Inline mono for a figure quoted mid-sentence. */
export function Data({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: '0.94em', fontWeight: 500 }}>
      {children}
    </span>
  )
}

export function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <>
      <Button href={href} className="nx-btn" style={styles.button}>
        {children} &rarr;
      </Button>
      <Text className="nx-muted" style={styles.linkFallback}>
        Button not working?{' '}
        <Link href={href} className="nx-link" style={styles.link}>Open the secure link</Link>
      </Text>
    </>
  )
}

/**
 * A caveat that changes what the reader should do. If it does not change
 * behaviour it is a disclaimer, and disclaimers belong in FinePrint or nowhere.
 */
export function Notice({ children }: { children: React.ReactNode }) {
  return <Text className="nx-muted nx-rule" style={styles.notice}>{children}</Text>
}

export function FinePrint({ children }: { children: React.ReactNode }) {
  return <Text className="nx-faint" style={styles.fine}>{children}</Text>
}
