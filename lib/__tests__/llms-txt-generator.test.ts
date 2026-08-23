import { describe, expect, it } from 'vitest'
import { buildLlmsTxt, extractLlmsTxtInputs } from '../server/llms-txt-generator'

const HTML = `<!doctype html><html><head>
<title>Acme Studio - Brand &amp; Strategy</title>
<meta name="description" content="A boutique brand studio for founders.">
<meta property="og:site_name" content="Acme Studio">
</head><body>
<nav>
  <a href="/services">Services</a>
  <a href="/pricing?utm=x#top">Pricing</a>
  <a href="/about"><span>About  us</span></a>
  <a href="https://other-site.com/partners">Partners</a>
  <a href="mailto:hi@acme.example">Email</a>
  <a href="/services">Services again (dupe)</a>
</nav>
</body></html>`

describe('extractLlmsTxtInputs', () => {
  const inputs = extractLlmsTxtInputs(HTML, 'https://acme.example/')

  it('prefers og:site_name for the title and decodes entities in the description path', () => {
    expect(inputs.title).toBe('Acme Studio')
    expect(inputs.description).toBe('A boutique brand studio for founders.')
    expect(inputs.origin).toBe('https://acme.example')
  })

  it('keeps only same-origin, deduped, labeled links (no mailto/external; query/hash stripped)', () => {
    expect(inputs.links).toEqual([
      { label: 'Services', url: 'https://acme.example/services' },
      { label: 'Pricing', url: 'https://acme.example/pricing' },
      { label: 'About us', url: 'https://acme.example/about' },
    ])
  })

  it('falls back to <title> when og:site_name is absent', () => {
    const noOg = HTML.replace(/<meta property="og:site_name"[^>]*>/, '')
    expect(extractLlmsTxtInputs(noOg, 'https://acme.example/').title).toBe('Acme Studio - Brand & Strategy')
  })
})

describe('buildLlmsTxt', () => {
  it('renders the llmstxt.org shape: H1, blockquote summary, Pages section', () => {
    const out = buildLlmsTxt(extractLlmsTxtInputs(HTML, 'https://acme.example/'))
    expect(out.startsWith('# Acme Studio\n')).toBe(true)
    expect(out).toContain('> A boutique brand studio for founders.')
    expect(out).toContain('## Pages')
    expect(out).toContain('- [Services](https://acme.example/services)')
    expect(out).not.toContain('other-site.com')
  })

  it('degrades gracefully with no metadata: hostname title + placeholder summary', () => {
    const out = buildLlmsTxt(extractLlmsTxtInputs('<html><body>hi</body></html>', 'https://bare.example/'))
    expect(out.startsWith('# bare.example\n')).toBe(true)
    expect(out).toContain('> Describe in one or two sentences')
    expect(out).not.toContain('## Pages') // no links found → section omitted
  })
})
