import { AgentPage, getBaseUrl } from './agent-page'
import { buildJsonLd } from './page-jsonld'
import { safeJsonScript } from './safe-json'
import { markdownText } from './agent-text'

/**
 * Copy-paste blocks a merchant embeds on their OWN existing website to make it
 * agent-legible + agent-transactable, all anchored at their EXISTING Nexez listing
 * artifacts (nexez.app/<slug>/agent.json etc.). Pure — no fetches, no Date — so the
 * kit is deterministic + snapshot-testable, and every block derives from already
 * PUBLIC listing data (so it needs no verification to be safe to show/copy).
 */
export type KitBlock = {
  id: 'llms_txt' | 'well_known_agent_json' | 'jsonld' | 'head_link' | 'badge' | 'widget'
  title: string
  description: string
  language: 'text' | 'json' | 'html' | 'js'
  filename?: string
  content: string
}

/** Escape a free-form string for interpolation into a double-quoted HTML attribute. */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** One artifact path on the merchant's own domain → its live Nexez listing URL. */
export type RedirectRule = { from: string; to: string }

/**
 * The 301 map a merchant installs so agents hitting THEIR domain's artifact paths
 * get the merchant's LIVE Nexez listing artifacts (never a stale snapshot). Pure.
 * `/mcp.json` is only included when the listing has MCP enabled (else that route 404s).
 */
export function buildArtifactRedirects(page: AgentPage, opts: { baseUrl?: string } = {}): RedirectRule[] {
  const base = (opts.baseUrl ?? getBaseUrl()).replace(/\/$/, '')
  const listingUrl = `${base}/${page.slug}`
  const rules: RedirectRule[] = [
    { from: '/.well-known/agent.json', to: `${listingUrl}/agent.json` },
    { from: '/agent.json', to: `${listingUrl}/agent.json` },
    { from: '/llms.txt', to: `${listingUrl}/llms.txt` },
    { from: '/openapi.json', to: `${listingUrl}/openapi.json` },
  ]
  if ((page as { mcp_enabled?: boolean }).mcp_enabled) {
    rules.push({ from: '/mcp.json', to: `${listingUrl}/mcp.json` })
  }
  return rules
}

/** A copy-paste redirect recipe for one hosting stack, generated from the rules. */
export type RecipeBlock = {
  id: 'apache' | 'nginx' | 'netlify' | 'vercel' | 'cloudflare'
  title: string
  description: string
  language: 'text' | 'json' | 'js'
  filename: string
  content: string
}

/**
 * Server-config recipes that 301 the merchant's artifact paths to their live
 * Nexez listing — the LIVE replacement for the static `.well-known/agent.json`
 * snapshot (which goes stale when offers change). Pure + deterministic. The
 * WordPress plugin and Shopify app automate the same redirects server-side.
 */
export function buildRedirectRecipes(page: AgentPage, opts: { baseUrl?: string } = {}): RecipeBlock[] {
  const rules = buildArtifactRedirects(page, opts)
  const header = '# Nexez — serve your live agent artifacts (301). Never goes stale.'

  return [
    {
      id: 'apache',
      title: 'Apache (.htaccess)',
      description: 'Add these lines to your site’s .htaccess (Apache / cPanel hosts).',
      language: 'text',
      filename: '.htaccess',
      content: [header, ...rules.map((r) => `Redirect 301 ${r.from} ${r.to}`)].join('\n'),
    },
    {
      id: 'nginx',
      title: 'Nginx',
      description: 'Add these inside your server block, then reload nginx.',
      language: 'text',
      filename: 'nginx.conf',
      content: [header, ...rules.map((r) => `location = ${r.from} { return 301 ${r.to}; }`)].join('\n'),
    },
    {
      id: 'netlify',
      title: 'Netlify / static host',
      description: 'Append to your _redirects file (Netlify, Cloudflare Pages). The ! forces the redirect even if a file exists.',
      language: 'text',
      filename: '_redirects',
      content: [header, ...rules.map((r) => `${r.from}  ${r.to}  301!`)].join('\n'),
    },
    {
      id: 'vercel',
      title: 'Vercel (vercel.json)',
      description: 'Merge this redirects array into your vercel.json.',
      language: 'json',
      filename: 'vercel.json',
      content: JSON.stringify(
        { redirects: rules.map((r) => ({ source: r.from, destination: r.to, permanent: true })) },
        null,
        2,
      ),
    },
    {
      id: 'cloudflare',
      title: 'Cloudflare Worker',
      description: 'Deploy as a Worker on your domain’s route — for hosts where you can’t edit server config.',
      language: 'js',
      filename: 'nexez-worker.js',
      content: [
        '// Nexez — serve your live agent artifacts (301).',
        `const NEXEZ_ARTIFACTS = ${JSON.stringify(
          Object.fromEntries(rules.map((r) => [r.from, r.to])),
          null,
          2,
        )};`,
        'export default {',
        '  fetch(request) {',
        '    const to = NEXEZ_ARTIFACTS[new URL(request.url).pathname];',
        '    return to ? Response.redirect(to, 301) : fetch(request);',
        '  },',
        '};',
      ].join('\n'),
    },
  ]
}

/** A copy-paste HEAD snippet + where to paste it, for a hosted site builder that
 * can't add server redirects or serve /.well-known files. */
export type InjectionRecipe = {
  id: 'wix' | 'squarespace' | 'generic'
  title: string
  /** Where in the platform's UI to paste the snippet. */
  instructions: string
  language: 'html'
  content: string
}

/**
 * Head code-injection recipes for HOSTED site builders (Wix, Squarespace, and any
 * "header code" box). These platforms don't let you add server redirects or host a
 * /.well-known file, so the redirect recipes don't apply — instead the merchant
 * injects the JSON-LD (the single biggest legibility win) + the manifest link tag
 * site-wide. Pure + deterministic; derives only from public listing data.
 */
export function buildCodeInjectionRecipes(page: AgentPage, opts: { baseUrl?: string } = {}): InjectionRecipe[] {
  const base = (opts.baseUrl ?? getBaseUrl()).replace(/\/$/, '')
  const slug = page.slug
  const agentJsonUrl = `${base}/${slug}/agent.json`
  const name = page.name || slug
  // The two <head> blocks a hosted builder can inject: structured data + discovery link.
  const headSnippet = [
    '<!-- Nexez — make this site agent-legible (structured offers + manifest link) -->',
    `<script type="application/ld+json">${safeJsonScript(buildJsonLd(page, base))}</script>`,
    `<link rel="alternate" type="application/json" href="${agentJsonUrl}" title="${escapeHtmlAttr(name)} — agent manifest">`,
  ].join('\n')

  return [
    {
      id: 'wix',
      title: 'Wix',
      instructions: 'Wix dashboard → Settings → Custom Code → + Add Custom Code. Paste below, set “Place Code in” to Head, and apply to All pages.',
      language: 'html',
      content: headSnippet,
    },
    {
      id: 'squarespace',
      title: 'Squarespace',
      instructions: 'Squarespace → Settings → Advanced → Code Injection. Paste into the Header box and save.',
      language: 'html',
      content: headSnippet,
    },
    {
      id: 'generic',
      title: 'Any site builder',
      instructions: 'Paste into your platform’s site-wide “header code” / custom <head> box (Webflow, Framer, Carrd, GoDaddy, etc.).',
      language: 'html',
      content: headSnippet,
    },
  ]
}

export function buildAgentReadyKit(page: AgentPage, opts: { baseUrl?: string } = {}): KitBlock[] {
  const base = (opts.baseUrl ?? getBaseUrl()).replace(/\/$/, '')
  const slug = page.slug
  const listingUrl = `${base}/${slug}`
  const agentJsonUrl = `${listingUrl}/agent.json`
  const llmsUrl = `${listingUrl}/llms.txt`
  const name = page.name || slug
  const summary = markdownText(page.description || `${name} — offers you can transact with through AI agents.`)

  const pointer = {
    schema_version: 'nexez.agent-pointer.v1',
    name,
    agent_json_url: agentJsonUrl,
    storefront_url: listingUrl,
    llms_url: llmsUrl,
  }

  return [
    {
      id: 'llms_txt',
      title: 'llms.txt',
      description: 'Append this to your site’s /llms.txt (create the file if you don’t have one). It points AI agents straight at your agent-ready listing.',
      language: 'text',
      filename: 'llms.txt (append)',
      content: [
        '## Agent commerce',
        summary,
        '',
        `Listing: ${listingUrl}`,
        `Agent JSON: ${agentJsonUrl}`,
        `llms.txt: ${llmsUrl}`,
        '',
      ].join('\n'),
    },
    {
      id: 'well_known_agent_json',
      title: '.well-known/agent.json (static fallback)',
      description: 'Only if you can’t add a redirect rule: host this pointer at /.well-known/agent.json. Prefer the redirect recipe — it points agents straight at your live listing and never goes stale when your offers change.',
      language: 'json',
      filename: '.well-known/agent.json',
      content: JSON.stringify(pointer, null, 2),
    },
    {
      id: 'jsonld',
      title: 'Structured data (JSON-LD)',
      description: 'Paste this into your homepage or offers page <head>. It gives agents (and search engines) your offers as schema.org data — the single biggest legibility win.',
      language: 'html',
      content: `<script type="application/ld+json">${safeJsonScript(buildJsonLd(page, base))}</script>`,
    },
    {
      id: 'head_link',
      title: 'Manifest link tag',
      description: 'Add this <link> to your site <head> so agents can discover your agent manifest from any page.',
      language: 'html',
      content: `<link rel="alternate" type="application/json" href="${agentJsonUrl}" title="${escapeHtmlAttr(name)} — agent manifest">`,
    },
    {
      id: 'badge',
      title: 'Agent-Ready badge (for human visitors)',
      description: 'A trust badge for your human visitors — it shows your site transacts with AI agents and links to your public listing. (Decorative; it does not affect what agents read.)',
      language: 'html',
      content: `<a href="${listingUrl}"><img src="${listingUrl}/badge.svg" alt="Agent-Ready on Nexez" height="28"></a>`,
    },
    {
      id: 'widget',
      title: 'Book / buy button (for human visitors)',
      description: 'An optional floating button so human visitors can open your agent-ready listing and transact. (A convenience for people — agents read the structured data above, not this script.)',
      language: 'js',
      content: `<script>(function(){var s=document.createElement('script');s.src='${base}/widget.js';s.onload=function(){Nexez.init({slug:'${slug}',theme:'light'})};document.head.appendChild(s);})();</script>`,
    },
  ]
}
