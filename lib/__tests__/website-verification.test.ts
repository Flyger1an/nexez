import { describe, expect, it } from 'vitest'
import {
  doubledRecordMessage,
  doubledVerificationTxtHost,
  generateWebsiteVerificationToken,
  isWellFormedWebsiteToken,
  matchesVerificationFile,
  matchesVerificationMeta,
  verificationMetaTag,
  VERIFICATION_TXT_LABEL,
  verificationTxtHost,
  websiteHostOf,
  WEBSITE_TOKEN_PREFIX,
} from '../website-verification'

describe('website token', () => {
  it('generates a well-formed, prefixed, sufficiently-long token', () => {
    const t = generateWebsiteVerificationToken()
    expect(t.startsWith(WEBSITE_TOKEN_PREFIX)).toBe(true)
    expect(isWellFormedWebsiteToken(t)).toBe(true)
    expect(t.length).toBeGreaterThan(WEBSITE_TOKEN_PREFIX.length + 15)
    // Distinct from the custom-domain flow's prefix so TXT values never cross-match.
    expect(WEBSITE_TOKEN_PREFIX).not.toBe('nexez-verify-')
  })

  it('rejects malformed tokens', () => {
    expect(isWellFormedWebsiteToken('')).toBe(false)
    expect(isWellFormedWebsiteToken('nexez-verify-abc123')).toBe(false) // domain prefix, not ours
    expect(isWellFormedWebsiteToken(`${WEBSITE_TOKEN_PREFIX}XYZ`)).toBe(false) // non-hex
    expect(isWellFormedWebsiteToken(null)).toBe(false)
  })
})

describe('websiteHostOf', () => {
  it('extracts the lowercased hostname, prepends https when bare', () => {
    expect(websiteHostOf('https://Acme.COM/pricing')).toBe('acme.com')
    expect(websiteHostOf('acme.com')).toBe('acme.com')
    expect(websiteHostOf('www.acme.com/x?y=1')).toBe('www.acme.com')
  })
  it('returns null for garbage / non-http / no-dot hosts', () => {
    expect(websiteHostOf('')).toBeNull()
    expect(websiteHostOf('   ')).toBeNull()
    expect(websiteHostOf('ftp://acme.com')).toBeNull()
    expect(websiteHostOf('localhost')).toBeNull() // no dot
    expect(websiteHostOf(null)).toBeNull()
  })
})

describe('verificationTxtHost', () => {
  it('prefixes the _nexez-verify record name', () => {
    expect(verificationTxtHost('acme.com')).toBe('_nexez-verify.acme.com')
  })
})

describe('matchesVerificationMeta', () => {
  const token = `${WEBSITE_TOKEN_PREFIX}abcdef0123456789`

  it('matches regardless of attribute order or quote style', () => {
    expect(matchesVerificationMeta(`<meta name="nexez-site-verification" content="${token}">`, token)).toBe(true)
    expect(matchesVerificationMeta(`<meta content='${token}' name='nexez-site-verification' />`, token)).toBe(true)
    expect(matchesVerificationMeta(`<META NAME="nexez-site-verification" CONTENT="${token}">`, token)).toBe(true)
  })

  it('requires an EXACT token match (substring/prefix must not pass)', () => {
    expect(matchesVerificationMeta(`<meta name="nexez-site-verification" content="${token}extra">`, token)).toBe(false)
    expect(matchesVerificationMeta(`<meta name="nexez-site-verification" content="x${token}">`, token)).toBe(false)
    // Cross-flow: a domain-prefixed token must never satisfy a site token
    expect(matchesVerificationMeta(`<meta name="nexez-site-verification" content="nexez-verify-abcdef0123456789">`, token)).toBe(false)
  })

  it('ignores the wrong meta name + missing tags', () => {
    expect(matchesVerificationMeta(`<meta name="description" content="${token}">`, token)).toBe(false)
    expect(matchesVerificationMeta('<html><head></head></html>', token)).toBe(false)
    expect(matchesVerificationMeta('', token)).toBe(false)
  })
})

describe('matchesVerificationFile', () => {
  const token = `${WEBSITE_TOKEN_PREFIX}abcdef0123456789`
  it('matches an exact trimmed line', () => {
    expect(matchesVerificationFile(token, token)).toBe(true)
    expect(matchesVerificationFile(`\n  ${token}  \n`, token)).toBe(true)
    expect(matchesVerificationFile(`# comment\n${token}\n`, token)).toBe(true)
  })
  it('rejects substring-only / empty', () => {
    expect(matchesVerificationFile(`prefix ${token} suffix`, token)).toBe(false)
    expect(matchesVerificationFile('', token)).toBe(false)
  })
})

describe('verificationMetaTag', () => {
  it('renders the exact copy-paste tag', () => {
    expect(verificationMetaTag('T')).toBe('<meta name="nexez-site-verification" content="T">')
  })
})

describe('doubled (zone-appended) TXT record detection', () => {
  it('builds the doubled host most registrars create from a pasted FQDN', () => {
    expect(doubledVerificationTxtHost('kismetpros.com')).toBe('_nexez-verify.kismetpros.com.kismetpros.com')
    expect(doubledVerificationTxtHost('agents.acme.co.uk')).toBe('_nexez-verify.agents.acme.co.uk.agents.acme.co.uk')
  })

  it('is distinct from the correct host', () => {
    const host = 'kismetpros.com'
    expect(doubledVerificationTxtHost(host)).not.toBe(verificationTxtHost(host))
    expect(doubledVerificationTxtHost(host).startsWith(verificationTxtHost(host))).toBe(true)
  })

  it('tells the owner the exact bare label to use', () => {
    const message = doubledRecordMessage('kismetpros.com')
    expect(message).toContain('_nexez-verify.kismetpros.com.kismetpros.com')
    expect(message).toContain(`just "${VERIFICATION_TXT_LABEL}"`)
    expect(VERIFICATION_TXT_LABEL).toBe('_nexez-verify')
    // The bare label must not carry a trailing dot or the zone.
    expect(VERIFICATION_TXT_LABEL.endsWith('.')).toBe(false)
    expect(VERIFICATION_TXT_LABEL).not.toContain('kismetpros')
  })
})
