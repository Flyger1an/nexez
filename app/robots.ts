import type { MetadataRoute } from 'next'
import { getBaseUrl } from '../lib/agent-page'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()

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

