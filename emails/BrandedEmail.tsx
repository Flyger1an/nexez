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
  Link,
  Img,
} from '@react-email/components'
import { BRAND, NEXEZ_EMAIL_LOGO_URL, styles, TONE, type EmailTone } from './theme'

const MSO_OPEN = '<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td width="600"><![endif]-->'
const MSO_CLOSE = '<!--[if mso]></td></tr></table><![endif]-->'
const Mso = ({ html }: { html: string }) => (
  <div
    style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}
    dangerouslySetInnerHTML={{ __html: html }}
  />
)

export function BrandedEmail({
  preview,
  category,
  children,
}: {
  preview: string
  category?: 'Buyer order' | 'Merchant action' | 'Account update'
  children: React.ReactNode
}) {
  const year = new Date().getFullYear()
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Mso html={MSO_OPEN} />
        <Container style={styles.container}>
          <Section style={styles.frame}>
            <Section style={styles.masthead}>
              <Row>
                <Column style={{ width: '170px' }}>
                  <Img
                    alt="Nexez"
                    height="24"
                    src={NEXEZ_EMAIL_LOGO_URL}
                    style={styles.logo}
                    width="144"
                  />
                </Column>
                <Column>
                  <Text style={styles.productLabel}>{category || 'Account update'}</Text>
                </Column>
              </Row>
            </Section>
            <Section style={styles.content}>{children}</Section>
          </Section>
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Nexez keeps buyers, merchants, and AI agents aligned on verified commerce state.
            </Text>
            <Text style={styles.footerText}>
              © {year} Nexez · Reply to this email for support.
            </Text>
          </Section>
        </Container>
        <Mso html={MSO_CLOSE} />
      </Body>
    </Html>
  )
}

export function EmailEyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>
}

export function StatusBadge({ tone = 'neutral', children }: { tone?: EmailTone; children: React.ReactNode }) {
  return <Text style={{ ...styles.status, ...TONE[tone] }}>{children}</Text>
}

export function EmailHeading({
  tone = 'neutral',
  children,
}: {
  tone?: EmailTone
  children: React.ReactNode
}) {
  const color = tone === 'positive'
    ? BRAND.ready
    : tone === 'caution'
      ? BRAND.amber
      : tone === 'danger'
        ? BRAND.danger
        : BRAND.ink
  return (
    <Heading as="h1" style={{ ...styles.heading, color }}>
      {children}
    </Heading>
  )
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <Text style={styles.lead}>{children}</Text>
}

export function InfoRows({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  const present = rows.filter(([, value]) => value)
  if (!present.length) return null
  return (
    <Section style={styles.details}>
      {present.map(([key, value], index) => (
        <Row key={`${key}-${index}`} style={index === present.length - 1 ? styles.rowLast : styles.row}>
          <Column style={styles.rowKey}>{key}</Column>
          <Column style={styles.rowVal}>{value}</Column>
        </Row>
      ))}
    </Section>
  )
}

export function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <>
      <Button href={href} style={styles.button}>
        {children} →
      </Button>
      <Text style={styles.linkFallback}>
        Button not working? <Link href={href} style={styles.footerLink}>Open the secure link</Link>
      </Text>
    </>
  )
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <Text style={styles.notice}>{children}</Text>
}

export function FinePrint({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fine}>{children}</Text>
}
