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
      title: '.well-known/agent.json',
      description: 'Host this JSON at your site’s /.well-known/agent.json so agents that probe the well-known namespace discover your listing. (A 301 redirect from that path to the Agent JSON URL works equally well.)',
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
      title: 'Agent-Ready badge',
      description: 'Show visitors your site transacts with AI agents. Links to your public listing.',
      language: 'html',
      content: `<a href="${listingUrl}"><img src="${listingUrl}/badge.svg" alt="Agent-Ready on Nexez" height="28"></a>`,
    },
    {
      id: 'widget',
      title: 'Book / buy via agent button',
      description: 'A tiny floating button that opens your agent-ready listing so human visitors can transact too.',
      language: 'js',
      content: `<script>(function(){var s=document.createElement('script');s.src='${base}/widget.js';s.onload=function(){Nexez.init({slug:'${slug}',theme:'light'})};document.head.appendChild(s);})();</script>`,
    },
  ]
}
