import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { AGENT_RUNTIME_HOST, APP_HOST } from '../lib/site'

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Host-aware: each crawlable domain points at its own sitemap (the marketing
  // sitemap on nexez.ai, the agent runtime sitemap on nexez.app). The
  // authenticated app is intentionally kept out of search indexes.
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || AGENT_RUNTIME_HOST).split(',')[0]!.trim()
  const baseUrl = host.startsWith('localhost') || host.startsWith('127.') ? `http://${host}` : `https://${host}`
  const normalizedHost = host.split(':')[0]!.toLowerCase()

  if (normalizedHost === APP_HOST || normalizedHost === `www.${APP_HOST}`) {
    // Fully disallowed, so no sitemap: advertising one while blocking every
    // path is contradictory to crawlers.
    return {
      rules: [
        {
          userAgent: '*',
          disallow: '/',
        },
      ],
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        // Explicitly welcome the major AI agents/crawlers (core to Nexez's promise).
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'ClaudeBot',
          'Claude-SearchBot',
          'Claude-User',
          'PerplexityBot',
          'Perplexity-User',
          'Google-Extended',
          'Googlebot',
          'Bingbot',
          'Applebot',
          'Applebot-Extended',
          'Amazonbot',
          'Meta-ExternalAgent',
          'cohere-ai',
          'Bytespider',
          'YouBot',
          'DuckAssistBot',
        ],
        allow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
