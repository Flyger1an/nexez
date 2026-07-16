import 'server-only'
import { getImportUrlError, getResolvedImportUrlError, safeFetch } from '../importer'
import { HTML_BYTE_CAP, normalizeScanUrl, readBodyCapped } from './site-scan'

// The free /tools/llms-txt-generator backend: fetch a public page (same SSRF
// posture as the scanner — pinned DNS, standard ports, byte-capped) and derive a
// spec-shaped llms.txt (llmstxt.org: H1 title, > summary blockquote, link sections)
// from what the page itself declares. Deterministic — no LLM, no stored data.

const GENERATOR_UA = 'NexezLlmsTxtGenerator/1.0 (+https://nexez.ai/tools/llms-txt-generator)'
const MAX_LINKS = 12

export type LlmsTxtInputs = {
  title: string
  description: string
  origin: string
  links: { label: string; url: string }[]
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstMatch(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) {
      const value = decodeEntities(m[1])
      if (value) return value
    }
  }
  return ''
}

/** Pure extraction of the llms.txt ingredients from a page's HTML. */
export function extractLlmsTxtInputs(html: string, finalUrl: string): LlmsTxtInputs {
  const origin = new URL(finalUrl).origin
  const title = firstMatch(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
  ])
  const description = firstMatch(html, [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  ])

  // Same-origin, path-bearing anchors with human labels — the site's own idea of
  // its important pages. Deduped by path, capped.
  const links: { label: string; url: string }[] = []
  const seen = new Set<string>(['/'])
  const anchorRe = /<a\b[^>]*href=["']([^"'#?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) && links.length < MAX_LINKS) {
    let href = m[1]
    if (href.startsWith('//')) continue
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue
    try {
      const abs = new URL(href, finalUrl)
      if (abs.origin !== origin) continue
      href = abs.pathname
    } catch {
      continue
    }
    if (seen.has(href)) continue
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, ' '))
    if (!label || label.length > 80) continue
    seen.add(href)
    links.push({ label, url: `${origin}${href}` })
  }

  return { title, description, origin, links }
}

/** Render the llmstxt.org-shaped file. Pure. */
export function buildLlmsTxt(inputs: LlmsTxtInputs): string {
  const title = inputs.title || new URL(inputs.origin).hostname
  const lines: string[] = [`# ${title}`, '']
  lines.push(`> ${inputs.description || `Describe in one or two sentences what ${title} offers and who it serves.`}`)
  lines.push('')
  lines.push('Key facts an AI agent should know: what you sell, pricing or how to get a quote,')
  lines.push('how to book or buy, and where you operate. Replace this paragraph with yours.')
  lines.push('')
  if (inputs.links.length) {
    lines.push('## Pages')
    lines.push('')
    for (const link of inputs.links) lines.push(`- [${link.label}](${link.url})`)
    lines.push('')
  }
  lines.push('## Optional')
  lines.push('')
  lines.push(`- [Contact](${inputs.origin}/contact): How to reach a human.`)
  return `${lines.join('\n')}\n`
}

/** Fetch + derive. Same fail-shapes as the scanner: `{ error }` on anything unsafe. */
export async function generateLlmsTxtForUrl(rawUrl: string): Promise<{ llmsTxt: string; sourceUrl: string } | { error: string }> {
  const url = normalizeScanUrl(rawUrl)
  if (!url) return { error: 'A valid URL is required' }
  const urlError = getImportUrlError(url) || (await getResolvedImportUrlError(url, { useCache: false, failClosed: true }))
  if (urlError) return { error: urlError }
  const parsed = new URL(url)
  if (parsed.port && !((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80'))) {
    return { error: 'Standard HTTP and HTTPS ports only.' }
  }

  const res = await safeFetch(
    url,
    { headers: { 'User-Agent': GENERATOR_UA, Accept: 'text/html,application/xhtml+xml' } },
    { timeoutMs: 6500, pinnedDns: true, standardPortsOnly: true },
  )
  if (!res || !res.ok) return { error: 'Could not fetch that page. Check the URL and try again.' }
  const html = (await readBodyCapped(res, HTML_BYTE_CAP)) || ''
  if (!html.trim()) return { error: 'That page returned no readable HTML.' }

  const finalUrl = res.url || url
  return { llmsTxt: buildLlmsTxt(extractLlmsTxtInputs(html, finalUrl)), sourceUrl: finalUrl }
}
