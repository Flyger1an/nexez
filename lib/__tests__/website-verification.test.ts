import { describe, expect, it } from 'vitest'
import {
  doubledRecordMessage,
  doubledVerificationTxtCandidates,
  doubledVerificationTxtHost,
  generateWebsiteVerificationToken,
  isWellFormedWebsiteToken,
  matchesVerificationFile,
  matchesVerificationMeta,
  verificationMetaTag,
  VERIFICATION_TXT_LABEL,
  verificationTxtHost,
  verificationTxtLabelForZone,
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
  })

  it('is distinct from the correct host', () => {
    const host = 'kismetpros.com'
    expect(doubledVerificationTxtHost(host)).not.toBe(verificationTxtHost(host))
    expect(doubledVerificationTxtHost(host).startsWith(verificationTxtHost(host))).toBe(true)
  })

  it('covers every plausible parent zone, most specific first', () => {
    // Apex site: the only plausible zone is the host itself.
    expect(doubledVerificationTxtCandidates('kismetpros.com')).toEqual([
      { doubledHost: '_nexez-verify.kismetpros.com.kismetpros.com', zone: 'kismetpros.com' },
    ])

    // Subdomain site: the provider appends the ZONE, which may be either the
    // subdomain (delegated) or the registrable domain. Both must be probed.
    const sub = doubledVerificationTxtCandidates('shop.example.com')
    expect(sub).toEqual([
      { doubledHost: '_nexez-verify.shop.example.com.shop.example.com', zone: 'shop.example.com' },
      { doubledHost: '_nexez-verify.shop.example.com.example.com', zone: 'example.com' },
    ])
  })

  it('derives the exact Host label from the matched zone', () => {
    // Apex: bare label.
    expect(verificationTxtLabelForZone('kismetpros.com', 'kismetpros.com')).toBe('_nexez-verify')
    // Subdomain in the registrable zone: label keeps the subdomain part. This is
    // the case the first version of this guidance got wrong.
    expect(verificationTxtLabelForZone('shop.example.com', 'example.com')).toBe('_nexez-verify.shop')
    expect(verificationTxtLabelForZone('a.b.example.com', 'example.com')).toBe('_nexez-verify.a.b')
    // Delegated subdomain zone: bare label again.
    expect(verificationTxtLabelForZone('shop.example.com', 'shop.example.com')).toBe('_nexez-verify')
  })

  it('names the right label for apex and subdomain sites', () => {
    const apex = doubledRecordMessage('kismetpros.com', 'kismetpros.com')
    expect(apex).toContain('_nexez-verify.kismetpros.com.kismetpros.com')
    expect(apex).toContain('just "_nexez-verify"')

    const subdomain = doubledRecordMessage('shop.example.com', 'example.com')
    expect(subdomain).toContain('_nexez-verify.shop.example.com.example.com')
    expect(subdomain).toContain('just "_nexez-verify.shop"')
    // Regression: must NOT tell a subdomain site to use the bare apex label.
    expect(subdomain).not.toContain('just "_nexez-verify"')
  })

  it('defaults the zone to the host so apex callers stay correct', () => {
    expect(doubledRecordMessage('kismetpros.com')).toBe(doubledRecordMessage('kismetpros.com', 'kismetpros.com'))
  })

  it('exports the leading label unchanged', () => {
    expect(VERIFICATION_TXT_LABEL).toBe('_nexez-verify')
  })
})
