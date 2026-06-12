import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { APP_HOST } from '../lib/site'

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Host-aware: each domain points at its own sitemap (the marketing sitemap on
  // nexez.ai, the agent/product sitemap on nexez.app).
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || APP_HOST).split(',')[0]!.trim()
  const baseUrl = host.startsWith('localhost') || host.startsWith('127.') ? `http://${host}` : `https://${host}`

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
          'Claude-Web',
          'anthropic-ai',
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
