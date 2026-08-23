import * as React from 'react'
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Row,
  Column,
  Text,
  Button,
  Heading,
  Hr,
  Link,
} from '@react-email/components'
import { BRAND, styles, TONE } from './theme'

/**
 * The single branded shell every Nexez email shares: proper <Html>/<Head>, a
 * <Preview> (the inbox snippet line), the wordmark header, a white card, and a
 * footer. Email-safe (react-email primitives render Outlook-friendly tables;
 * inline styles only; exact brand palette from ./theme).
 */
// Static MSO ghost-table wrappers. Outlook's Word engine ignores CSS max-width, so
// these conditional comments cap the layout at 560px there. The content is PURE STATIC
// markup (never any user input) - conditional comments can't be emitted any other way
// from react-email, so this is the one sanctioned use of dangerouslySetInnerHTML here.
const MSO_OPEN = '<!--[if mso]><table role="presentation" align="center" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td width="560"><![endif]-->'
const MSO_CLOSE = '<!--[if mso]></td></tr></table><![endif]-->'
const Mso = ({ html }: { html: string }) => <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: html }} />

export function BrandedEmail({ preview, children }: { preview: string; children: React.ReactNode }) {
  const year = new Date().getFullYear()
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Mso html={MSO_OPEN} />
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.wordmark}>
              <span style={styles.logoMark}>N</span>nexez<span style={{ color: BRAND.signal }}>.</span>
            </Text>
          </Section>
          <Section style={styles.card}>{children}</Section>
          <Hr style={styles.footerRule} />
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Nexez - where AI agents discover, book, and buy from your business.
            </Text>
            <Text style={styles.footerText}>
              © {year} Nexez · <Link href="mailto:support@nexez.ai" style={styles.footerLink}>support@nexez.ai</Link>
            </Text>
          </Section>
        </Container>
        <Mso html={MSO_CLOSE} />
      </Body>
    </Html>
  )
}

/** Section heading inside the card, tone-colored (neutral/positive/caution/danger). */
export function EmailHeading({ tone = 'neutral', children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <Heading as="h2" style={{ ...styles.heading, color: TONE[tone] }}>
      {children}
    </Heading>
  )
}

/** The intro paragraph. Also a good source for the <Preview> snippet. */
export function Lead({ children }: { children: React.ReactNode }) {
  return <Text style={styles.lead}>{children}</Text>
}

/** Key/value detail table. Falsy values are dropped (matches the old builders). */
export function InfoRows({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  const present = rows.filter(([, v]) => v)
  if (!present.length) return null
  return (
    <Section style={{ margin: '0 0 22px' }}>
      {present.map(([k, v]) => (
        <Row key={k}>
          <Column style={styles.rowKey}>{k}</Column>
          <Column style={styles.rowVal}>{v}</Column>
        </Row>
      ))}
    </Section>
  )
}

/** Primary CTA - always periwinkle (brand) with white text. */
export function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button href={href} style={styles.button}>
      {children}
    </Button>
  )
}

/** Small print under the CTA (e.g. "ignore if you weren't expecting this"). */
export function FinePrint({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fine}>{children}</Text>
}
